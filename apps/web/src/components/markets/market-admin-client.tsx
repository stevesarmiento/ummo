"use client"

import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithinSizeLimit,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
} from "@solana/kit"
import { assertIsTransactionWithBlockhashLifetime } from "@solana/transactions"
import { useConnectorClient, useKitTransactionSigner } from "@solana/connector"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  UMMO_MARKET_PROGRAM_ADDRESS,
  getAssociatedTokenAddress,
  getDepositInstruction,
  getEngineAddress,
  getExecuteTradeInstruction,
  getInitLpPoolInstruction,
  getInitShardInstruction,
  getLpBandConfigAddress,
  getLpPoolAddress,
  getLpPositionAddress,
  getDepositLpInstruction,
  getOpenTraderInstruction,
  getSetMatcherAuthorityInstruction,
  getSetLpBandConfigInstruction,
  getShardAddress,
  getTraderAddress,
} from "@ummo/sdk"

import { convexAction, convexQuery } from "@/lib/convex-http"

import {
  getCapabilityGroups,
  getTraderActionAvailability,
} from "./market-capabilities"
import { getMintTokenProgramAddress } from "./market-client-utils"

export interface MarketAdminClientProps {
  market: string
  authority: string
  collateralMint: string
  oracleFeed: string
  matcherAuthority: string
  shard: string | null
  lastCrankSlot: unknown
}

interface DerivedAddresses {
  engine: string | null
  trader: string | null
  lpPool: string | null
  lpPosition: string | null
  lpBandConfig: string | null
}

interface LpPoolDoc {
  lpPool: string
  pooledEngineIndex: number
  lpFeeBps: number
  protocolFeeBps: number
  totalShares: unknown
  accountingNav: unknown
}

interface LpPositionDoc {
  lpPosition: string
  owner: string
  shares: unknown
  depositedTotal: unknown
}

interface LpBandDoc {
  lpBandConfig: string
  firstBandMaxNotional: unknown
  firstBandMaxOracleDeviationBps: number
  firstBandSpreadBps: number
  firstBandMaxInventoryBps: number
  secondBandMaxNotional: unknown
  secondBandMaxOracleDeviationBps: number
  secondBandSpreadBps: number
  secondBandMaxInventoryBps: number
  thirdBandMaxNotional: unknown
  thirdBandMaxOracleDeviationBps: number
  thirdBandSpreadBps: number
  thirdBandMaxInventoryBps: number
}

interface TraderDoc {
  trader: string
  owner: string
  engineIndex: number
  collateralBalance: unknown
}

interface HybridQuoteResult {
  nowSlot: string
  oraclePostedSlot: string
  oraclePrice: string
  execPrice: string
  usedFallback: boolean
  depth: Array<{
    spreadBps: number
    maxOracleDeviationBps: number
    maxInventoryBps: number
    notional: string
  }>
}

const SYSVAR_RENT_ADDRESS = address(
  "SysvarRent111111111111111111111111111111111",
)

function parseFixedDecimal(value: string, decimals: number): bigint | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null

  const [wholeRaw, fracRaw = ""] = trimmed.split(".")
  if (fracRaw.length > decimals) return null

  const whole = BigInt(wholeRaw || "0")
  const frac = BigInt((fracRaw || "").padEnd(decimals, "0") || "0")
  const scale = 10n ** BigInt(decimals)
  return whole * scale + frac
}

function formatFixedDecimal(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals)
  const whole = value / scale
  const frac = value % scale
  const fracStr = frac.toString(10).padStart(decimals, "0").replace(/0+$/, "")
  return fracStr ? `${whole.toString(10)}.${fracStr}` : whole.toString(10)
}

function getCreateAssociatedTokenAccountInstruction(args: {
  payer: Address
  associatedToken: Address
  owner: Address
  mint: Address
  tokenProgram: Address
}): Instruction {
  return {
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    accounts: [
      { address: args.payer, role: AccountRole.WRITABLE_SIGNER },
      { address: args.associatedToken, role: AccountRole.WRITABLE },
      { address: args.owner, role: AccountRole.READONLY },
      { address: args.mint, role: AccountRole.READONLY },
      { address: address("11111111111111111111111111111111"), role: AccountRole.READONLY },
      { address: args.tokenProgram, role: AccountRole.READONLY },
      { address: SYSVAR_RENT_ADDRESS, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(),
  }
}

function wsUrlFromHttpUrl(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) return `wss://${httpUrl.slice("https://".length)}`
  if (httpUrl.startsWith("http://")) return `ws://${httpUrl.slice("http://".length)}`
  return httpUrl
}

function toBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value
  if (typeof value === "number") return BigInt(value)
  if (typeof value === "string") {
    try {
      return BigInt(value)
    } catch {
      return null
    }
  }
  return null
}

function getStatusPillClass(
  kind: "working" | "blocked" | "stubbed",
): string {
  if (kind === "working")
    return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
  if (kind === "blocked")
    return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
  return "bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-200"
}

export function MarketAdminClient(props: MarketAdminClientProps) {
  const client = useConnectorClient()
  const { signer, ready } = useKitTransactionSigner()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [wasIndexed, setWasIndexed] = useState<boolean | null>(null)
  const [nextMatcherAuthorityInput, setNextMatcherAuthorityInput] = useState(
    props.matcherAuthority,
  )
  const [initShardIdInput, setInitShardIdInput] = useState("0")
  const [initShardSeedInput, setInitShardSeedInput] = useState(props.oracleFeed)
  const [lpDepositInput, setLpDepositInput] = useState("100")
  const [band1MaxNotionalInput, setBand1MaxNotionalInput] = useState("1000")
  const [band2MaxNotionalInput, setBand2MaxNotionalInput] = useState("5000")
  const [band3MaxNotionalInput, setBand3MaxNotionalInput] = useState("20000")
  const [band1SpreadInput, setBand1SpreadInput] = useState("5")
  const [band2SpreadInput, setBand2SpreadInput] = useState("20")
  const [band3SpreadInput, setBand3SpreadInput] = useState("50")
  const [band1DeviationInput, setBand1DeviationInput] = useState("10")
  const [band2DeviationInput, setBand2DeviationInput] = useState("50")
  const [band3DeviationInput, setBand3DeviationInput] = useState("150")
  const [band1InventoryInput, setBand1InventoryInput] = useState("2000")
  const [band2InventoryInput, setBand2InventoryInput] = useState("5000")
  const [band3InventoryInput, setBand3InventoryInput] = useState("9000")
  const [quoteNotionalInput, setQuoteNotionalInput] = useState("1000")
  const [quoteSide, setQuoteSide] = useState<"long" | "short">("long")
  const [traderDepositInput, setTraderDepositInput] = useState("100")
  const [tradeSizeInput, setTradeSizeInput] = useState("0.1")
  const [derived, setDerived] = useState<DerivedAddresses>({
    engine: null,
    trader: null,
    lpPool: null,
    lpPosition: null,
    lpBandConfig: null,
  })
  const [lpPool, setLpPool] = useState<LpPoolDoc | null>(null)
  const [lpPositions, setLpPositions] = useState<LpPositionDoc[] | null>(null)
  const [lpBands, setLpBands] = useState<LpBandDoc[] | null>(null)
  const [traders, setTraders] = useState<TraderDoc[] | null>(null)
  const [hybridQuote, setHybridQuote] = useState<HybridQuoteResult | null>(null)

  const ownerAddress = signer?.address as Address | undefined
  const marketAddress = useMemo(() => address(props.market), [props.market])
  const marketAuthorityAddress = useMemo(
    () => address(props.authority),
    [props.authority],
  )
  const oracleFeedAddress = useMemo(
    () => address(props.oracleFeed),
    [props.oracleFeed],
  )
  const collateralMintAddress = useMemo(
    () => address(props.collateralMint),
    [props.collateralMint],
  )
  const shardAddress = useMemo(
    () => (props.shard ? address(props.shard) : null),
    [props.shard],
  )

  const isMarketAuthority = ownerAddress === marketAuthorityAddress
  const hasShard = Boolean(shardAddress)
  const hasTrader = Boolean(traders?.some((row) => row.owner === ownerAddress))
  const capabilityGroups = useMemo(() => getCapabilityGroups(), [])
  const traderActions = useMemo(
    () => getTraderActionAvailability({ hasShard, hasTrader }),
    [hasShard, hasTrader],
  )
  const lastCrankSlot = useMemo(() => toBigInt(props.lastCrankSlot), [props.lastCrankSlot])

  useEffect(() => {
    let isCancelled = false

    async function deriveAddresses() {
      if (!shardAddress) {
        if (!isCancelled)
          setDerived({ engine: null, trader: null, lpPool: null, lpPosition: null, lpBandConfig: null })
        return
      }

      const lpPool = await getLpPoolAddress({ shard: shardAddress })
      const nextDerived: DerivedAddresses = {
        engine: await getEngineAddress({ shard: shardAddress }),
        trader:
          ownerAddress != null
            ? await getTraderAddress({ shard: shardAddress, owner: ownerAddress })
            : null,
        lpPool,
        lpPosition:
          ownerAddress != null
            ? await getLpPositionAddress({ lpPool, owner: ownerAddress })
            : null,
        lpBandConfig:
          ownerAddress != null
            ? await getLpBandConfigAddress({ lpPool, owner: ownerAddress })
            : null,
      }

      if (!isCancelled) setDerived(nextDerived)
    }

    void deriveAddresses()

    return () => {
      isCancelled = true
    }
  }, [ownerAddress, shardAddress])

  const refreshLpData = useCallback(async () => {
    if (!shardAddress) {
      setLpPool(null)
      setLpPositions(null)
      setLpBands(null)
      return
    }
    const [poolDoc, positionRows, bandRows] = await Promise.all([
      convexQuery<LpPoolDoc | null>("lpPools:getByShard", { shard: shardAddress }),
      ownerAddress
        ? convexQuery<LpPositionDoc[]>("lpPositions:listByOwnerMarket", {
            owner: ownerAddress,
            market: marketAddress,
          })
        : Promise.resolve([]),
      derived.lpPool
        ? convexQuery<LpBandDoc[]>("lpBands:listByPool", { lpPool: derived.lpPool })
        : Promise.resolve([]),
    ])
    const traderRows = ownerAddress
      ? await convexQuery<TraderDoc[]>("traders:getByOwnerMarket", {
          owner: ownerAddress,
          market: marketAddress,
        })
      : []
    setLpPool(poolDoc)
    setLpPositions(positionRows)
    setLpBands(bandRows)
    setTraders(traderRows)
  }, [derived.lpPool, marketAddress, ownerAddress, shardAddress])

  useEffect(() => {
    void refreshLpData()
  }, [refreshLpData])

  const sendAndIndex = useCallback(
    async (ixs: readonly Instruction[]) => {
      if (!signer || !client) throw new Error("Wallet not connected")
      const rpcUrl = client.getRpcUrl()
      if (!rpcUrl) throw new Error("No RPC endpoint configured")

      const rpc = createSolanaRpc(rpcUrl)
      const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrlFromHttpUrl(rpcUrl))
      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()

      const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) =>
          setTransactionMessageFeePayerSigner(
            signer as unknown as Parameters<
              typeof setTransactionMessageFeePayerSigner
            >[0],
            tx,
          ),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        (tx) => appendTransactionMessageInstructions(ixs, tx),
      )

      const signedTransaction = await signTransactionMessageWithSigners(transactionMessage)
      assertIsTransactionWithBlockhashLifetime(signedTransaction)
      assertIsTransactionWithinSizeLimit(signedTransaction)

      await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(
        signedTransaction,
        { commitment: "confirmed" },
      )

      const txSig = getSignatureFromTransaction(signedTransaction)
      setSignature(txSig)

      await convexAction("indexer:indexTransaction", { signature: txSig, rpcUrl })
      setWasIndexed(true)
      return txSig
    },
    [client, signer],
  )

  const handleRotateMatcherAuthority = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    setWasIndexed(null)

    if (!ownerAddress || !signer) return
    if (!isMarketAuthority) {
      setErrorMessage("Only the market authority can rotate the matcher.")
      return
    }

    let newMatcherAuthority: Address
    try {
      newMatcherAuthority = address(nextMatcherAuthorityInput.trim())
    } catch {
      setErrorMessage("Enter a valid matcher authority address.")
      return
    }

    setIsSubmitting(true)
    try {
      const ix = getSetMatcherAuthorityInstruction({
        authority: ownerAddress,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        newMatcherAuthority,
      })

      await sendAndIndex([ix])
    } catch (error) {
      setWasIndexed(false)
      setErrorMessage(
        error instanceof Error ? error.message : "Rotate matcher failed",
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [
    isMarketAuthority,
    marketAddress,
    nextMatcherAuthorityInput,
    oracleFeedAddress,
    ownerAddress,
    sendAndIndex,
    signer,
  ])

  const handleInitShard = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    setWasIndexed(null)
    if (!ownerAddress || !signer) return
    if (!isMarketAuthority) {
      setErrorMessage("Only the market authority can add shards.")
      return
    }

    const shardId = Number(initShardIdInput.trim())
    if (!Number.isInteger(shardId) || shardId < 0 || shardId > 65_535) {
      setErrorMessage("Enter a valid shard id (0-65535).")
      return
    }

    let shardSeed: Address
    try {
      shardSeed = address(initShardSeedInput.trim())
    } catch {
      setErrorMessage("Enter a valid shard seed address.")
      return
    }

    setIsSubmitting(true)
    try {
      const shard = await getShardAddress({ market: marketAddress, shardSeed })
      const engine = await getEngineAddress({ shard })
      const ix = getInitShardInstruction({
        payer: ownerAddress,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shardSeed,
        shard,
        engine,
        shardId,
      })
      await sendAndIndex([ix])
      window.location.assign(
        `/markets/${encodeURIComponent(props.market)}?shard=${encodeURIComponent(shard)}`,
      )
    } catch (error) {
      setWasIndexed(false)
      setErrorMessage(error instanceof Error ? error.message : "Create shard failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    initShardIdInput,
    initShardSeedInput,
    isMarketAuthority,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    props.market,
    sendAndIndex,
    signer,
  ])

  const handleInitLpPool = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    setWasIndexed(null)
    if (!ownerAddress || !signer || !shardAddress || !derived.lpPool) return
    if (!isMarketAuthority) {
      setErrorMessage("Only the market authority can initialize the LP pool.")
      return
    }

    setIsSubmitting(true)
    try {
      const ix = getInitLpPoolInstruction({
        payer: ownerAddress,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shard: shardAddress,
        lpPool: address(derived.lpPool),
      })
      await sendAndIndex([ix])
      await refreshLpData()
    } catch (error) {
      setWasIndexed(false)
      setErrorMessage(error instanceof Error ? error.message : "Init LP pool failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    derived.lpPool,
    isMarketAuthority,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refreshLpData,
    sendAndIndex,
    shardAddress,
    signer,
  ])

  const handleDepositLp = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    setWasIndexed(null)
    if (!ownerAddress || !signer || !shardAddress || !derived.lpPool || !derived.engine || !derived.lpPosition) return

    const amount = parseFixedDecimal(lpDepositInput, 6)
    if (!amount || amount <= 0n) {
      setErrorMessage("Enter a valid LP deposit amount.")
      return
    }

    setIsSubmitting(true)
    try {
      const rpcUrl = client?.getRpcUrl()
      if (!rpcUrl) throw new Error("No RPC endpoint configured")
      const rpc = createSolanaRpc(rpcUrl)
      const tokenProgram = await getMintTokenProgramAddress({
        rpc,
        mint: collateralMintAddress,
      })

      const userCollateral = await getAssociatedTokenAddress({
        owner: ownerAddress,
        mint: collateralMintAddress,
        tokenProgram,
      })
      const vaultCollateral = await getAssociatedTokenAddress({
        owner: shardAddress,
        mint: collateralMintAddress,
        tokenProgram,
      })

      const ixs: Instruction[] = []
      const vaultAccount = await rpc.getAccountInfo(vaultCollateral, { encoding: "base64" }).send()
      if (!vaultAccount.value) {
        ixs.push(
          getCreateAssociatedTokenAccountInstruction({
            payer: ownerAddress,
            associatedToken: vaultCollateral,
            owner: shardAddress,
            mint: collateralMintAddress,
            tokenProgram,
          }),
        )
      }

      ixs.push(
        getDepositLpInstruction({
          owner: ownerAddress,
          oracleFeed: oracleFeedAddress,
          market: marketAddress,
          shard: shardAddress,
          lpPool: address(derived.lpPool),
          engine: address(derived.engine),
          lpPosition: address(derived.lpPosition),
          collateralMint: collateralMintAddress,
          userCollateral,
          vaultCollateral,
          tokenProgram,
          amount,
        }),
      )

      await sendAndIndex(ixs)
      await refreshLpData()
    } catch (error) {
      setWasIndexed(false)
      setErrorMessage(error instanceof Error ? error.message : "LP deposit failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    client,
    collateralMintAddress,
    derived.engine,
    derived.lpPool,
    derived.lpPosition,
    lpDepositInput,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refreshLpData,
    sendAndIndex,
    shardAddress,
    signer,
  ])

  const handleSetBands = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    setWasIndexed(null)
    if (!ownerAddress || !signer || !shardAddress || !derived.lpPool || !derived.lpBandConfig) return

    const bands = [
      {
        maxNotional: BigInt(band1MaxNotionalInput || "0") * 1_000_000n,
        maxOracleDeviationBps: Number(band1DeviationInput),
        spreadBps: Number(band1SpreadInput),
        maxInventoryBps: Number(band1InventoryInput),
      },
      {
        maxNotional: BigInt(band2MaxNotionalInput || "0") * 1_000_000n,
        maxOracleDeviationBps: Number(band2DeviationInput),
        spreadBps: Number(band2SpreadInput),
        maxInventoryBps: Number(band2InventoryInput),
      },
      {
        maxNotional: BigInt(band3MaxNotionalInput || "0") * 1_000_000n,
        maxOracleDeviationBps: Number(band3DeviationInput),
        spreadBps: Number(band3SpreadInput),
        maxInventoryBps: Number(band3InventoryInput),
      },
    ]

    if (bands.some((band) => !band.maxNotional || band.maxOracleDeviationBps <= 0 || band.spreadBps <= 0 || band.maxInventoryBps <= 0)) {
      setErrorMessage("All band values must be positive.")
      return
    }

    setIsSubmitting(true)
    try {
      const ix = getSetLpBandConfigInstruction({
        owner: ownerAddress,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shard: shardAddress,
        lpPool: address(derived.lpPool),
        lpBandConfig: address(derived.lpBandConfig),
        bands,
      })
      await sendAndIndex([ix])
      await refreshLpData()
    } catch (error) {
      setWasIndexed(false)
      setErrorMessage(error instanceof Error ? error.message : "Set LP bands failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    band1DeviationInput,
    band1InventoryInput,
    band1MaxNotionalInput,
    band1SpreadInput,
    band2DeviationInput,
    band2InventoryInput,
    band2MaxNotionalInput,
    band2SpreadInput,
    band3DeviationInput,
    band3InventoryInput,
    band3MaxNotionalInput,
    band3SpreadInput,
    derived.lpBandConfig,
    derived.lpPool,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refreshLpData,
    sendAndIndex,
    shardAddress,
    signer,
  ])

  const handlePreviewDepth = useCallback(async () => {
    setErrorMessage(null)
    const desiredNotional = parseFixedDecimal(quoteNotionalInput, 6)
    if (!desiredNotional || !shardAddress) {
      setErrorMessage("Enter a valid synthetic quote notional and ensure a shard exists.")
      return
    }

    setIsSubmitting(true)
    try {
      const result = await convexAction<HybridQuoteResult>("matcher:getHybridQuote", {
        market: marketAddress,
        shard: shardAddress,
        oracleFeed: oracleFeedAddress,
        desiredNotional: desiredNotional.toString(),
        side: quoteSide,
      })
      setHybridQuote(result)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Depth preview failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [marketAddress, oracleFeedAddress, quoteNotionalInput, quoteSide, shardAddress])

  const handleOpenTrader = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    setWasIndexed(null)
    if (!ownerAddress || !signer || !shardAddress || !derived.engine || !derived.trader) return

    setIsSubmitting(true)
    try {
      const ix = getOpenTraderInstruction({
        owner: ownerAddress,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shard: shardAddress,
        engine: address(derived.engine),
        trader: address(derived.trader),
      })
      await sendAndIndex([ix])
      await refreshLpData()
    } catch (error) {
      setWasIndexed(false)
      setErrorMessage(error instanceof Error ? error.message : "Open account failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    derived.engine,
    derived.trader,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refreshLpData,
    sendAndIndex,
    shardAddress,
    signer,
  ])

  const handleTraderDeposit = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    setWasIndexed(null)
    if (!ownerAddress || !signer || !shardAddress || !derived.engine || !derived.trader) return

    const amount = parseFixedDecimal(traderDepositInput, 6)
    if (!amount || amount <= 0n) {
      setErrorMessage("Enter a valid trader deposit amount.")
      return
    }

    setIsSubmitting(true)
    try {
      const rpcUrl = client?.getRpcUrl()
      if (!rpcUrl) throw new Error("No RPC endpoint configured")
      const rpc = createSolanaRpc(rpcUrl)
      const tokenProgram = await getMintTokenProgramAddress({
        rpc,
        mint: collateralMintAddress,
      })
      const userCollateral = await getAssociatedTokenAddress({
        owner: ownerAddress,
        mint: collateralMintAddress,
        tokenProgram,
      })
      const vaultCollateral = await getAssociatedTokenAddress({
        owner: shardAddress,
        mint: collateralMintAddress,
        tokenProgram,
      })
      const ixs: Instruction[] = []
      const vaultAccount = await rpc.getAccountInfo(vaultCollateral, { encoding: "base64" }).send()
      if (!vaultAccount.value) {
        ixs.push(
          getCreateAssociatedTokenAccountInstruction({
            payer: ownerAddress,
            associatedToken: vaultCollateral,
            owner: shardAddress,
            mint: collateralMintAddress,
            tokenProgram,
          }),
        )
      }
      ixs.push(
        getDepositInstruction({
          owner: ownerAddress,
          oracleFeed: oracleFeedAddress,
          market: marketAddress,
          shard: shardAddress,
          engine: address(derived.engine),
          trader: address(derived.trader),
          collateralMint: collateralMintAddress,
          userCollateral,
          vaultCollateral,
          tokenProgram,
          amount,
        }),
      )
      await sendAndIndex(ixs)
      await refreshLpData()
    } catch (error) {
      setWasIndexed(false)
      setErrorMessage(error instanceof Error ? error.message : "Trader deposit failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    client,
    collateralMintAddress,
    derived.engine,
    derived.trader,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refreshLpData,
    sendAndIndex,
    shardAddress,
    signer,
    traderDepositInput,
  ])

  const handleExecuteTrade = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    setWasIndexed(null)
    if (!ownerAddress || !signer || !shardAddress || !derived.engine || !derived.trader) return

    const sizeQ = parseFixedDecimal(tradeSizeInput, 6)
    if (!sizeQ || sizeQ <= 0n) {
      setErrorMessage("Enter a valid trade size.")
      return
    }

    setIsSubmitting(true)
    try {
      const quote = await convexAction<HybridQuoteResult>("matcher:getHybridQuote", {
        market: marketAddress,
        shard: shardAddress,
        oracleFeed: oracleFeedAddress,
        sizeQ: sizeQ.toString(),
        side: quoteSide,
      })
      setHybridQuote(quote)

      const ix = getExecuteTradeInstruction({
        owner: ownerAddress,
        matcher: address(props.matcherAuthority),
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shard: shardAddress,
        engine: address(derived.engine),
        lpPool: address(derived.lpPool!),
        trader: address(derived.trader),
        execPrice: BigInt(quote.execPrice),
        sizeQ: quoteSide === "long" ? sizeQ : -sizeQ,
      })
      await sendAndIndex([ix])
      await refreshLpData()
    } catch (error) {
      setWasIndexed(false)
      setErrorMessage(error instanceof Error ? error.message : "Trade failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    derived.engine,
    derived.lpPool,
    derived.trader,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    props.matcherAuthority,
    quoteSide,
    refreshLpData,
    sendAndIndex,
    shardAddress,
    signer,
    tradeSizeInput,
  ])

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
          Capability matrix
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {([
            ["working", capabilityGroups.working],
            ["blocked", capabilityGroups.blocked],
            ["stubbed", capabilityGroups.stubbed],
          ] as const).map(([group, items]) => (
            <div
              key={group}
              className="rounded-lg border border-black/10 p-3 dark:border-white/10"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-700 dark:text-zinc-200">
                {group}
              </div>
              <div className="mt-3 flex flex-col gap-3">
                {items.map((item) => (
                  <div key={item.key} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getStatusPillClass(
                          item.state,
                        )}`}
                      >
                        {item.state}
                      </span>
                      <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                        {item.label}
                      </span>
                    </div>
                    {item.reason ? (
                      <div className="text-xs text-zinc-600 dark:text-zinc-300">
                        {item.reason}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Admin controls
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-300">
              Only truly usable admin operations are active.
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  Add shard
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  {hasShard
                    ? "Shard exists and can be managed below."
                    : "Creates the first execution shard for this market."}
                </div>
              </div>
              <button
                type="button"
                onClick={handleInitShard}
                disabled={!ready || isSubmitting || !isMarketAuthority || hasShard}
                className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
              >
                Create shard
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={initShardIdInput}
                onChange={(e) => setInitShardIdInput(e.target.value)}
                placeholder="Shard id"
                inputMode="numeric"
                className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
              <input
                value={initShardSeedInput}
                onChange={(e) => setInitShardSeedInput(e.target.value)}
                placeholder="Shard seed"
                inputMode="text"
                className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
            </div>
          </div>

          <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  Rotate matcher authority
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  This is live on-chain right now.
                </div>
              </div>
              <button
                type="button"
                onClick={handleRotateMatcherAuthority}
                disabled={!ready || isSubmitting || !isMarketAuthority}
                className="inline-flex h-9 items-center justify-center rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-50"
              >
                Rotate
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <div className="text-xs text-zinc-600 dark:text-zinc-300">
                Current: <span className="font-mono">{props.matcherAuthority}</span>
              </div>
              <input
                value={nextMatcherAuthorityInput}
                onChange={(e) => setNextMatcherAuthorityInput(e.target.value)}
                inputMode="text"
                className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
              {!isMarketAuthority ? (
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  Visible with reasons: only the market authority can execute this
                  action.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  LP pool
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  One pooled LP balance sheet per shard, with the house LP as fallback.
                </div>
              </div>
              <button
                type="button"
                onClick={handleInitLpPool}
                disabled={!ready || isSubmitting || !isMarketAuthority || !hasShard || Boolean(lpPool)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-50"
              >
                {lpPool ? "Pool ready" : "Init LP pool"}
              </button>
            </div>
            <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
              Pool PDA: <span className="font-mono">{derived.lpPool ?? "Unavailable"}</span>
            </div>
            {lpPool ? (
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-zinc-600 dark:text-zinc-300 sm:grid-cols-2">
                <div>Engine index: <span className="font-mono">{lpPool.pooledEngineIndex}</span></div>
                <div>LP fee bps: <span className="font-mono">{lpPool.lpFeeBps}</span></div>
                <div>Total shares: <span className="font-mono">{toBigInt(lpPool.totalShares)?.toString(10) ?? "0"}</span></div>
                <div>Accounting NAV: <span className="font-mono">{formatFixedDecimal(toBigInt(lpPool.accountingNav) ?? 0n, 6)} USDC</span></div>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  LP deposit
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  Add USDC to the pooled LP backing structure and receive proportional shares.
                </div>
              </div>
              <button
                type="button"
                onClick={handleDepositLp}
                disabled={!ready || isSubmitting || !hasShard || !lpPool}
                className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
              >
                Deposit LP
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={lpDepositInput}
                onChange={(e) => setLpDepositInput(e.target.value)}
                placeholder="100"
                inputMode="decimal"
                className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
              <span className="text-xs text-zinc-600 dark:text-zinc-300">USDC</span>
            </div>
            {lpPositions?.length ? (
              <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
                Your LP positions:{" "}
                {lpPositions.map((position) => (
                  <span key={position.lpPosition} className="mr-3 font-mono">
                    {position.lpPosition.slice(0, 8)}… shares {toBigInt(position.shares)?.toString(10) ?? "0"}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  LP quote bands
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  Real band configuration from day one. Presets can sit on top later.
                </div>
              </div>
              <button
                type="button"
                onClick={handleSetBands}
                disabled={!ready || isSubmitting || !hasShard || !lpPool}
                className="inline-flex h-9 items-center justify-center rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-50"
              >
                Save bands
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                [
                  band1MaxNotionalInput,
                  setBand1MaxNotionalInput,
                  band1SpreadInput,
                  setBand1SpreadInput,
                  band1DeviationInput,
                  setBand1DeviationInput,
                  band1InventoryInput,
                  setBand1InventoryInput,
                  "Band 1",
                ],
                [
                  band2MaxNotionalInput,
                  setBand2MaxNotionalInput,
                  band2SpreadInput,
                  setBand2SpreadInput,
                  band2DeviationInput,
                  setBand2DeviationInput,
                  band2InventoryInput,
                  setBand2InventoryInput,
                  "Band 2",
                ],
                [
                  band3MaxNotionalInput,
                  setBand3MaxNotionalInput,
                  band3SpreadInput,
                  setBand3SpreadInput,
                  band3DeviationInput,
                  setBand3DeviationInput,
                  band3InventoryInput,
                  setBand3InventoryInput,
                  "Band 3",
                ],
              ].map(([maxNotional, setMaxNotional, spread, setSpread, deviation, setDeviation, inventory, setInventory, label]) => (
                <div key={label as string} className="rounded-md border border-black/10 p-3 dark:border-white/10">
                  <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{label as string}</div>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
                    <input value={maxNotional as string} onChange={(e) => (setMaxNotional as (v: string) => void)(e.target.value)} placeholder="Max notional (USDC)" className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white" />
                    <input value={spread as string} onChange={(e) => (setSpread as (v: string) => void)(e.target.value)} placeholder="Spread bps" className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white" />
                    <input value={deviation as string} onChange={(e) => (setDeviation as (v: string) => void)(e.target.value)} placeholder="Deviation bps" className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white" />
                    <input value={inventory as string} onChange={(e) => (setInventory as (v: string) => void)(e.target.value)} placeholder="Inventory bps" className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white" />
                  </div>
                </div>
              ))}
            </div>
            {lpBands?.length ? (
              <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
                Indexed LP band configs: {lpBands.length.toString(10)}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
          Trader path
        </div>
        <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
          Minimal end-to-end trader loop against the new liquidity baseline.
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  Open trader account
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  Creates the per-market trader mapping in the selected shard.
                </div>
              </div>
              <button
                type="button"
                onClick={handleOpenTrader}
                disabled={!ready || isSubmitting || !hasShard || hasTrader}
                className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
              >
                {hasTrader ? "Account opened" : "Open account"}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  Trader collateral
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  Deposit USDC into your trader account inside the selected shard.
                </div>
              </div>
              <button
                type="button"
                onClick={handleTraderDeposit}
                disabled={!ready || isSubmitting || !hasShard || !hasTrader}
                className="inline-flex h-9 items-center justify-center rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-50"
              >
                Deposit
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={traderDepositInput}
                onChange={(e) => setTraderDepositInput(e.target.value)}
                placeholder="100"
                inputMode="decimal"
                className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
              <span className="text-xs text-zinc-600 dark:text-zinc-300">USDC</span>
            </div>
          </div>

          <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  Trade
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  Uses the hybrid quote action and submits a real on-chain trade.
                </div>
              </div>
              <button
                type="button"
                onClick={handleExecuteTrade}
                disabled={!ready || isSubmitting || !hasShard || !hasTrader}
                className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
              >
                Trade
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuoteSide("long")}
                  disabled={isSubmitting}
                  className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium ${
                    quoteSide === "long"
                      ? "border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                      : "border-black/10 bg-white text-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50"
                  }`}
                >
                  Long
                </button>
                <button
                  type="button"
                  onClick={() => setQuoteSide("short")}
                  disabled={isSubmitting}
                  className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium ${
                    quoteSide === "short"
                      ? "border-rose-500/30 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-200"
                      : "border-black/10 bg-white text-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50"
                  }`}
                >
                  Short
                </button>
              </div>
              <input
                value={tradeSizeInput}
                onChange={(e) => setTradeSizeInput(e.target.value)}
                placeholder="0.1"
                inputMode="decimal"
                className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
              <span className="text-xs text-zinc-600 dark:text-zinc-300">SOL</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {traderActions.map((action) => (
            <div
              key={action.key}
              className="rounded-lg border border-black/10 p-3 dark:border-white/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                    {action.label}
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-300">
                    {action.reason}
                  </div>
                </div>
                <button
                  type="button"
                  disabled
                  className="inline-flex h-9 items-center justify-center rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-50"
                >
                  {action.label}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-xs text-zinc-600 dark:text-zinc-300">
          {hasShard ? (
            <>
              Selected shard exists, but trader and trading flows remain disabled
              until they are validated end-to-end.
            </>
          ) : (
            <>No shard exists yet, so all trader actions remain blocked.</>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
          Synthetic depth preview
        </div>
        <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
          Uses the same LP band aggregation path as the hybrid quote matcher action.
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuoteSide("long")}
              disabled={isSubmitting}
              className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium ${
                quoteSide === "long"
                  ? "border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                  : "border-black/10 bg-white text-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50"
              }`}
            >
              Long
            </button>
            <button
              type="button"
              onClick={() => setQuoteSide("short")}
              disabled={isSubmitting}
              className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium ${
                quoteSide === "short"
                  ? "border-rose-500/30 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-200"
                  : "border-black/10 bg-white text-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50"
              }`}
            >
              Short
            </button>
          </div>
          <input
            value={quoteNotionalInput}
            onChange={(e) => setQuoteNotionalInput(e.target.value)}
            placeholder="1000"
            inputMode="decimal"
            className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
          />
          <button
            type="button"
            onClick={handlePreviewDepth}
            disabled={isSubmitting || !hasShard || !lpPool}
            className="inline-flex h-9 items-center justify-center rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-50"
          >
            Preview quote
          </button>
        </div>
        {hybridQuote ? (
          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-lg border border-black/10 p-3 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300">
              <div>
                Oracle:{" "}
                <span className="font-mono">
                  {formatFixedDecimal(toBigInt(hybridQuote.oraclePrice) ?? 0n, 6)} USD
                </span>
              </div>
              <div>
                Exec:{" "}
                <span className="font-mono">
                  {formatFixedDecimal(toBigInt(hybridQuote.execPrice) ?? 0n, 6)} USD
                </span>
              </div>
              <div>
                Fallback used:{" "}
                <span className="font-mono">{hybridQuote.usedFallback ? "Yes" : "No"}</span>
              </div>
            </div>
            <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                Synthetic depth ladder
              </div>
              <div className="mt-3 flex flex-col gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                {hybridQuote.depth.length ? (
                  hybridQuote.depth.map((level, index) => (
                    <div key={`${level.spreadBps}-${index}`} className="flex flex-wrap gap-x-3 gap-y-1">
                      <span className="font-mono">{level.spreadBps} bps</span>
                      <span className="font-mono">
                        {formatFixedDecimal(toBigInt(level.notional) ?? 0n, 6)} USDC
                      </span>
                      <span className="font-mono">dev {level.maxOracleDeviationBps}</span>
                      <span className="font-mono">inv {level.maxInventoryBps}</span>
                    </div>
                  ))
                ) : (
                  <div>No LP depth available yet.</div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
          Debug
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <div className="flex flex-col">
            <span className="font-medium">Program id</span>
            <span className="font-mono">{UMMO_MARKET_PROGRAM_ADDRESS}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Market</span>
            <span className="font-mono">{props.market}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Selected shard</span>
            <span className="font-mono">{props.shard ?? "None"}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Derived engine PDA</span>
            <span className="font-mono">{derived.engine ?? "Unavailable"}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Derived trader PDA</span>
            <span className="font-mono">{derived.trader ?? "Unavailable"}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Connected wallet</span>
            <span className="font-mono">{ownerAddress ?? "Not connected"}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Last crank slot</span>
            <span className="font-mono">
              {lastCrankSlot ? lastCrankSlot.toString(10) : "Unknown"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Latest signature</span>
            <span className="font-mono">{signature ?? "None this session"}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Latest action indexed</span>
            <span className="font-mono">
              {wasIndexed === null ? "Unknown" : wasIndexed ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Latest error</span>
            <span className="font-mono">{errorMessage ?? "None"}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"

import {
  appendTransactionMessageInstructions,
  address,
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
  getAssociatedTokenAddress,
  getDepositInstruction,
  getEngineAddress,
  getExecuteTradeInstruction,
  getKeeperCrankInstruction,
  getInitShardInstruction,
  getLpPoolAddress,
  getLiquidateAtOracleInstruction,
  getOpenTraderInstruction,
  getShardAddress,
  getSetMatcherAuthorityInstruction,
  getTraderAddress,
  getWithdrawInstruction,
  MAX_CRANK_STALENESS_SLOTS,
  POSITION_SCALE_Q,
} from "@ummo/sdk"

import { convexAction, convexQuery } from "@/lib/convex-http"

import {
  getCreateAssociatedTokenAccountInstruction,
  getMintTokenProgramAddress,
} from "./market-client-utils"

interface TraderDoc {
  _id: string
  market: string
  shard: string
  trader: string
  owner: string
  engineIndex: number
  collateralBalance: unknown
  openedAtSlot: unknown
  indexedAt: number
}

interface PositionDoc {
  _id: string
  market: string
  shard: string
  trader: string
  owner: string
  engineIndex?: number
  positionSizeQ: unknown
  lastExecPrice: unknown
  lastOraclePrice: unknown
  lastUpdatedSlot: unknown
  indexedAt: number
}

interface LiquidationDoc {
  _id: string
  signature: string
  slot: unknown
  market: string
  shard: string
  keeper: string
  liquidateeOwner: string
  liquidateeEngineIndex: number
  liquidated: boolean
  oldEffectivePosQ: unknown
  nowSlot: unknown
  oraclePrice: unknown
  oraclePostedSlot: unknown
  indexedAt: number
}

interface ActivityEventBase {
  type: "Deposit" | "Withdrawal" | "TradeExecuted" | "Liquidation"
  signature: string
  slot: unknown
  market: string
  shard: string
  indexedAt: number
}

interface DepositActivityEvent extends ActivityEventBase {
  type: "Deposit"
  amount: unknown
}

interface WithdrawalActivityEvent extends ActivityEventBase {
  type: "Withdrawal"
  amount: unknown
  nowSlot: unknown
}

interface TradeActivityEvent extends ActivityEventBase {
  type: "TradeExecuted"
  sizeQ: unknown
  execPrice: unknown
  nowSlot: unknown
}

interface LiquidationActivityEvent extends ActivityEventBase {
  type: "Liquidation"
  liquidated: boolean
  liquidateeEngineIndex: number
  nowSlot: unknown
}

type ActivityEvent =
  | DepositActivityEvent
  | WithdrawalActivityEvent
  | TradeActivityEvent
  | LiquidationActivityEvent

export interface MarketClientProps {
  market: string
  authority: string
  shard: string
  oracleFeed: string
  collateralMint: string
  matcherAuthority: string
  lastCrankSlot: unknown
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

function parseFixedDecimal(value: string, decimals: number): bigint | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null

  const [wholeRaw, fracRaw = ""] = trimmed.split(".")
  if (fracRaw.length > decimals) return null

  const whole = BigInt(wholeRaw || "0")
  const fracPadded = fracRaw.padEnd(decimals, "0")
  const frac = BigInt(fracPadded || "0")
  const scale = 10n ** BigInt(decimals)
  return whole * scale + frac
}

function formatFixedDecimal(amount: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals)
  const whole = amount / scale
  const frac = amount % scale
  const fracStr = frac.toString(10).padStart(decimals, "0").replace(/0+$/, "")
  return fracStr ? `${whole.toString(10)}.${fracStr}` : whole.toString(10)
}

function wsUrlFromHttpUrl(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) return `wss://${httpUrl.slice("https://".length)}`
  if (httpUrl.startsWith("http://")) return `ws://${httpUrl.slice("http://".length)}`
  return httpUrl
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value
}

function formatSignedFixedDecimal(amount: bigint, decimals: number): string {
  const sign = amount < 0n ? "-" : ""
  return `${sign}${formatFixedDecimal(absBigInt(amount), decimals)}`
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function MarketClient(props: MarketClientProps) {
  const client = useConnectorClient()
  const { signer, ready } = useKitTransactionSigner()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [traders, setTraders] = useState<TraderDoc[] | null>(null)
  const [positions, setPositions] = useState<PositionDoc[] | null>(null)
  const [liquidations, setLiquidations] = useState<LiquidationDoc[] | null>(null)
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[] | null>(
    null,
  )
  const [depositInput, setDepositInput] = useState("10")
  const [withdrawInput, setWithdrawInput] = useState("5")
  const [tradeSizeInput, setTradeSizeInput] = useState("0.1")
  const [tradeSide, setTradeSide] = useState<"long" | "short">("long")
  const [liquidateeEngineIndexInput, setLiquidateeEngineIndexInput] = useState("0")
  const [initShardIdInput, setInitShardIdInput] = useState("1")
  const [initShardSeedInput, setInitShardSeedInput] = useState(props.authority)
  const [nextMatcherAuthorityInput, setNextMatcherAuthorityInput] = useState(
    props.matcherAuthority,
  )
  const [quote, setQuote] = useState<{
    execPrice: bigint
    oraclePrice: bigint
    nowSlot: bigint
    oraclePostedSlot: bigint
  } | null>(null)
  const [currentSlot, setCurrentSlot] = useState<bigint | null>(null)
  const [lastCrankSlot, setLastCrankSlot] = useState<bigint>(() => {
    const initial = toBigInt(props.lastCrankSlot)
    return initial ?? 0n
  })

  useEffect(() => {
    setLastCrankSlot(toBigInt(props.lastCrankSlot) ?? 0n)
  }, [props.lastCrankSlot])

  const marketAddress = useMemo(() => address(props.market), [props.market])
  const marketAuthorityAddress = useMemo(
    () => address(props.authority),
    [props.authority],
  )
  const shardAddress = useMemo(() => address(props.shard), [props.shard])
  const oracleFeedAddress = useMemo(
    () => address(props.oracleFeed),
    [props.oracleFeed],
  )
  const matcherAuthorityAddress = useMemo(
    () => address(props.matcherAuthority),
    [props.matcherAuthority],
  )
  const collateralMintAddress = useMemo(
    () => address(props.collateralMint),
    [props.collateralMint],
  )

  const ownerAddress = signer?.address as Address | undefined
  const isMarketAuthority = ownerAddress === marketAuthorityAddress

  const refresh = useCallback(async () => {
    if (!ownerAddress) {
      setTraders(null)
      setPositions(null)
      return
    }
    const rows = await convexQuery<TraderDoc[]>("traders:getByOwnerMarket", {
      owner: ownerAddress,
      market: marketAddress,
    })
    setTraders(rows)
  }, [marketAddress, ownerAddress])

  const refreshPositions = useCallback(async () => {
    if (!ownerAddress) {
      setPositions(null)
      return
    }
    const rows = await convexQuery<PositionDoc[]>("positions:getByOwnerMarket", {
      owner: ownerAddress,
      market: marketAddress,
    })
    setPositions(rows)
  }, [marketAddress, ownerAddress])

  const refreshLiquidations = useCallback(async () => {
    if (!ownerAddress) {
      setLiquidations(null)
      return
    }
    const rows = await convexQuery<LiquidationDoc[]>(
      "liquidations:getByOwnerMarket",
      { liquidateeOwner: ownerAddress, market: marketAddress },
    )
    setLiquidations(rows)
  }, [marketAddress, ownerAddress])

  const refreshActivity = useCallback(async () => {
    if (!ownerAddress) {
      setActivityEvents(null)
      return
    }
    const rows = await convexQuery<ActivityEvent[]>("activity:getByOwnerMarketShard", {
      owner: ownerAddress,
      market: marketAddress,
      shard: shardAddress,
      limit: 25,
    })
    setActivityEvents(rows)
  }, [marketAddress, ownerAddress, shardAddress])

  const refreshSlot = useCallback(async () => {
    const rpcUrl = client?.getRpcUrl()
    if (!rpcUrl) return
    const rpc = createSolanaRpc(rpcUrl)
    const slot = await rpc.getSlot().send()
    setCurrentSlot(BigInt(slot))
  }, [client])

  const refreshShard = useCallback(async () => {
    const doc = await convexQuery<{ lastCrankSlot: unknown } | null>(
      "shards:getByShard",
      { shard: shardAddress },
    )
    if (!doc) return
    setLastCrankSlot(toBigInt(doc.lastCrankSlot) ?? 0n)
  }, [shardAddress])

  useEffect(() => {
    void refresh()
    void refreshPositions()
    void refreshLiquidations()
    void refreshActivity()
    void refreshSlot()
    void refreshShard()
  }, [
    refresh,
    refreshActivity,
    refreshLiquidations,
    refreshPositions,
    refreshShard,
    refreshSlot,
  ])

  const trader = useMemo(() => {
    return traders?.find((t) => t.shard === shardAddress) ?? null
  }, [shardAddress, traders])

  const balance = useMemo(() => {
    const raw = trader?.collateralBalance
    return toBigInt(raw) ?? 0n
  }, [trader])

  const position = useMemo(() => {
    return positions?.find((p) => p.shard === shardAddress) ?? null
  }, [positions, shardAddress])
  const positionSizeQ = useMemo(
    () => toBigInt(position?.positionSizeQ) ?? 0n,
    [position],
  )
  const lastExecPrice = useMemo(
    () => toBigInt(position?.lastExecPrice) ?? 0n,
    [position],
  )

  const hasTrader = Boolean(trader)

  const crankStalenessSlots = useMemo(() => {
    if (currentSlot === null) return null
    const diff = currentSlot - lastCrankSlot
    return diff < 0n ? 0n : diff
  }, [currentSlot, lastCrankSlot])

  const isCrankStale = useMemo(() => {
    if (crankStalenessSlots === null) return null
    return crankStalenessSlots > MAX_CRANK_STALENESS_SLOTS
  }, [crankStalenessSlots])

  const matcherSigner = useMemo(() => {
    return {
      address: matcherAuthorityAddress,
      signTransactions: async (
        transactions: readonly { messageBytes: Uint8Array }[],
      ) => {
        const messageBase64s = transactions.map((tx) =>
          encodeBase64(tx.messageBytes),
        )

        const result = await convexAction<{
          signaturesBase64: string[]
        }>("matcher:signTransactions", {
          signer: matcherAuthorityAddress,
          oracleFeed: oracleFeedAddress,
          lastCrankSlot: Number(lastCrankSlot),
          willCrank: isCrankStale === true,
          messageBase64s,
        })

        return result.signaturesBase64.map((signatureBase64) => ({
          [matcherAuthorityAddress]: decodeBase64(signatureBase64),
        }))
      },
    }
  }, [
    isCrankStale,
    lastCrankSlot,
    matcherAuthorityAddress,
    oracleFeedAddress,
  ])

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

      const signedTransaction =
        await signTransactionMessageWithSigners(transactionMessage)
      assertIsTransactionWithBlockhashLifetime(signedTransaction)
      assertIsTransactionWithinSizeLimit(signedTransaction)

      await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(
        signedTransaction,
        { commitment: "confirmed" },
      )

      const txSig = getSignatureFromTransaction(signedTransaction)
      setSignature(txSig)

      await convexAction("indexer:indexTransaction", { signature: txSig })
    },
    [client, signer],
  )

  const handleCrank = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    if (!ownerAddress || !signer) return

    setIsSubmitting(true)
    try {
      const engine = await getEngineAddress({ shard: shardAddress })
      const quote = await convexAction<{ oraclePrice: string }>("matcher:getQuote", {
        oracleFeed: oracleFeedAddress,
      })
      const oraclePrice = toBigInt(quote.oraclePrice)
      if (!oraclePrice) throw new Error("Matcher returned an invalid oracle price")
      const ix = getKeeperCrankInstruction({
        keeper: ownerAddress,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shard: shardAddress,
        engine,
        nowSlot: 0n,
        oraclePrice,
        orderedCandidates: [],
        maxRevalidations: 0,
      })

      await sendAndIndex([ix])
      await Promise.all([refreshShard(), refreshSlot()])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Crank failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refreshShard,
    refreshSlot,
    sendAndIndex,
    shardAddress,
    signer,
  ])

  const handleOpenTrader = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    if (!ownerAddress || !signer) return

    setIsSubmitting(true)
    try {
      const engine = await getEngineAddress({ shard: shardAddress })
      const trader = await getTraderAddress({ shard: shardAddress, owner: ownerAddress })

      const ix = getOpenTraderInstruction({
        owner: ownerAddress,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shard: shardAddress,
        engine,
        trader,
      })

      await sendAndIndex([ix])
      await refresh()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Open account failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refresh,
    sendAndIndex,
    shardAddress,
    signer,
  ])

  const handleDeposit = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    if (!ownerAddress || !signer || !client) return

    const amount = parseFixedDecimal(depositInput, 6)
    if (!amount) {
      setErrorMessage("Enter a valid USDC amount (up to 6 decimals).")
      return
    }

    setIsSubmitting(true)
    try {
      const rpcUrl = client.getRpcUrl()
      if (!rpcUrl) throw new Error("No RPC endpoint configured")
      const rpc = createSolanaRpc(rpcUrl)
      const engine = await getEngineAddress({ shard: shardAddress })
      const trader = await getTraderAddress({ shard: shardAddress, owner: ownerAddress })
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
      const userAccount = await rpc.getAccountInfo(userCollateral, { encoding: "base64" }).send()
      if (!userAccount.value) {
        ixs.push(
          getCreateAssociatedTokenAccountInstruction({
            payer: ownerAddress,
            associatedToken: userCollateral,
            owner: ownerAddress,
            mint: collateralMintAddress,
            tokenProgram,
          }),
        )
      }
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
          engine,
          trader,
          collateralMint: collateralMintAddress,
          userCollateral,
          vaultCollateral,
          tokenProgram,
          amount,
        }),
      )

      await sendAndIndex(ixs)
      await Promise.all([refresh(), refreshActivity()])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Deposit failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    collateralMintAddress,
    depositInput,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refresh,
    refreshActivity,
    sendAndIndex,
    shardAddress,
    signer,
    client,
  ])

  const handleWithdraw = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    if (!ownerAddress || !signer || !client) return

    if (!hasTrader) {
      setErrorMessage("Open your account first.")
      return
    }

    const amount = parseFixedDecimal(withdrawInput, 6)
    if (!amount) {
      setErrorMessage("Enter a valid USDC amount (up to 6 decimals).")
      return
    }

    setIsSubmitting(true)
    try {
      const rpcUrl = client.getRpcUrl()
      if (!rpcUrl) throw new Error("No RPC endpoint configured")
      const rpc = createSolanaRpc(rpcUrl)
      const engine = await getEngineAddress({ shard: shardAddress })
      const trader = await getTraderAddress({ shard: shardAddress, owner: ownerAddress })
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
      const userAccount = await rpc.getAccountInfo(userCollateral, { encoding: "base64" }).send()
      if (!userAccount.value) {
        ixs.push(
          getCreateAssociatedTokenAccountInstruction({
            payer: ownerAddress,
            associatedToken: userCollateral,
            owner: ownerAddress,
            mint: collateralMintAddress,
            tokenProgram,
          }),
        )
      }
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
      if (isCrankStale === true) {
        const quote = await convexAction<{ oraclePrice: string }>("matcher:getQuote", {
          oracleFeed: oracleFeedAddress,
        })
        const oraclePrice = toBigInt(quote.oraclePrice)
        if (!oraclePrice) throw new Error("Matcher returned an invalid oracle price")
        ixs.push(
          getKeeperCrankInstruction({
            keeper: ownerAddress,
            oracleFeed: oracleFeedAddress,
            market: marketAddress,
            shard: shardAddress,
            engine,
            nowSlot: 0n,
            oraclePrice,
            orderedCandidates: [],
            maxRevalidations: 0,
          }),
        )
      }

      ixs.push(
        getWithdrawInstruction({
          owner: ownerAddress,
          oracleFeed: oracleFeedAddress,
          market: marketAddress,
          shard: shardAddress,
          engine,
          trader,
          collateralMint: collateralMintAddress,
          userCollateral,
          vaultCollateral,
          tokenProgram,
          amount,
        }),
      )

      await sendAndIndex(ixs)
      await Promise.all([refresh(), refreshActivity(), refreshShard(), refreshSlot()])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Withdraw failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    collateralMintAddress,
    hasTrader,
    isCrankStale,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refresh,
    refreshActivity,
    refreshShard,
    refreshSlot,
    sendAndIndex,
    shardAddress,
    signer,
    withdrawInput,
    client,
  ])

  const handleQuote = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    if (!ownerAddress) return
    if (!hasTrader) {
      setErrorMessage("Open your account first.")
      return
    }

    setIsSubmitting(true)
    try {
      const result = await convexAction<{
        nowSlot: string
        oraclePostedSlot: string
        oraclePrice: string
        execPrice: string
      }>("matcher:getQuote", { oracleFeed: oracleFeedAddress })

      const next = {
        nowSlot: toBigInt(result.nowSlot),
        oraclePostedSlot: toBigInt(result.oraclePostedSlot),
        oraclePrice: toBigInt(result.oraclePrice),
        execPrice: toBigInt(result.execPrice),
      }

      if (
        !next.nowSlot ||
        !next.oraclePostedSlot ||
        !next.oraclePrice ||
        !next.execPrice
      ) {
        throw new Error("Matcher returned an invalid quote")
      }

      setQuote({
        nowSlot: next.nowSlot,
        oraclePostedSlot: next.oraclePostedSlot,
        oraclePrice: next.oraclePrice,
        execPrice: next.execPrice,
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Quote failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [hasTrader, oracleFeedAddress, ownerAddress])

  const handleTrade = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    if (!ownerAddress || !signer) return

    if (!hasTrader) {
      setErrorMessage("Open your account first.")
      return
    }

    if (!quote) {
      setErrorMessage("Request a quote first.")
      return
    }

    const sizeAbsQ = parseFixedDecimal(tradeSizeInput, 6)
    if (!sizeAbsQ || sizeAbsQ < POSITION_SCALE_Q / 1000n) {
      setErrorMessage("Enter a valid SOL size (min 0.001).")
      return
    }

    const sizeQ = tradeSide === "long" ? sizeAbsQ : -sizeAbsQ

    setIsSubmitting(true)
    try {
      const engine = await getEngineAddress({ shard: shardAddress })
      const lpPool = await getLpPoolAddress({ shard: shardAddress })
      const trader = await getTraderAddress({ shard: shardAddress, owner: ownerAddress })

      const ixs: Instruction[] = []
      if (isCrankStale === true) {
        ixs.push(
          getKeeperCrankInstruction({
            keeper: ownerAddress,
            oracleFeed: oracleFeedAddress,
            market: marketAddress,
            shard: shardAddress,
            engine,
            nowSlot: 0n,
            oraclePrice: quote.oraclePrice,
            orderedCandidates: [],
            maxRevalidations: 0,
          }),
        )
      }

      const baseIx = getExecuteTradeInstruction({
        owner: ownerAddress,
        matcher: matcherAuthorityAddress,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shard: shardAddress,
        engine,
        lpPool,
        trader,
        execPrice: quote.execPrice,
        sizeQ,
      })

      const tradeAccounts = baseIx.accounts ?? []
      if (!tradeAccounts.length) throw new Error("Trade instruction missing accounts")

      const ix =
        matcherAuthorityAddress === ownerAddress
          ? baseIx
          : {
              ...baseIx,
              accounts: tradeAccounts.map((acc) => {
                if (acc.address !== matcherAuthorityAddress) return acc
                return { ...acc, signer: matcherSigner }
              }),
            }

      ixs.push(ix)

      await sendAndIndex(ixs)
      setQuote(null)
      await Promise.all([
        refresh(),
        refreshActivity(),
        refreshPositions(),
        refreshShard(),
        refreshSlot(),
      ])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Trade failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    hasTrader,
    isCrankStale,
    marketAddress,
    matcherAuthorityAddress,
    matcherSigner,
    oracleFeedAddress,
    ownerAddress,
    quote,
    refresh,
    refreshActivity,
    refreshShard,
    refreshPositions,
    refreshSlot,
    sendAndIndex,
    shardAddress,
    signer,
    tradeSide,
    tradeSizeInput,
  ])

  const handleInitShard = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    if (!ownerAddress || !signer) return

    if (!isMarketAuthority) {
      setErrorMessage("Only the market authority can add shards.")
      return
    }

    const shardId = Number(initShardIdInput.trim())
    if (
      !Number.isFinite(shardId) ||
      !Number.isInteger(shardId) ||
      shardId < 0 ||
      shardId > 65_535
    ) {
      setErrorMessage("Enter a valid shard id (0-65535).")
      return
    }

    let shardSeed: Address
    try {
      const raw = initShardSeedInput.trim() || props.authority
      shardSeed = address(raw)
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
      setErrorMessage(error instanceof Error ? error.message : "Init shard failed")
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
    props.authority,
    props.market,
    sendAndIndex,
    signer,
  ])

  const handleRotateMatcherAuthority = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
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
      window.location.reload()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Rotate matcher failed")
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

  const handleLiquidate = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    if (!ownerAddress || !signer) return

    const liquidateeEngineIndex = Number(liquidateeEngineIndexInput.trim())
    if (
      !Number.isFinite(liquidateeEngineIndex) ||
      !Number.isInteger(liquidateeEngineIndex) ||
      liquidateeEngineIndex < 0 ||
      liquidateeEngineIndex > 65_535
    ) {
      setErrorMessage("Enter a valid engine index (0-65535).")
      return
    }

    setIsSubmitting(true)
    try {
      const engine = await getEngineAddress({ shard: shardAddress })

      const ixs: Instruction[] = []
      if (isCrankStale === true) {
        const quote = await convexAction<{ oraclePrice: string }>("matcher:getQuote", {
          oracleFeed: oracleFeedAddress,
        })
        const oraclePrice = toBigInt(quote.oraclePrice)
        if (!oraclePrice) throw new Error("Matcher returned an invalid oracle price")
        ixs.push(
          getKeeperCrankInstruction({
            keeper: ownerAddress,
            oracleFeed: oracleFeedAddress,
            market: marketAddress,
            shard: shardAddress,
            engine,
            nowSlot: 0n,
            oraclePrice,
            orderedCandidates: [],
            maxRevalidations: 0,
          }),
        )
      }

      ixs.push(
        getLiquidateAtOracleInstruction({
          keeper: ownerAddress,
          oracleFeed: oracleFeedAddress,
          market: marketAddress,
          shard: shardAddress,
          engine,
          liquidateeEngineIndex,
        }),
      )

      await sendAndIndex(ixs)
      await Promise.all([
        refresh(),
        refreshActivity(),
        refreshPositions(),
        refreshLiquidations(),
        refreshShard(),
        refreshSlot(),
      ])
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Liquidation transaction failed",
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [
    isCrankStale,
    liquidateeEngineIndexInput,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refresh,
    refreshActivity,
    refreshLiquidations,
    refreshShard,
    refreshPositions,
    refreshSlot,
    sendAndIndex,
    shardAddress,
    signer,
  ])

  return (
    <div className="flex flex-col gap-4">
      {isMarketAuthority ? (
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                Admin
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-300">
                Market authority controls.
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-6">
            <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                    Add shard
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-300">
                    Creates a new shard + engine under this market. The shard seed must be an
                    existing account pubkey (your authority wallet works).
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleInitShard}
                  disabled={!ready || isSubmitting}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
                >
                  Create shard
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                    Shard id
                  </div>
                  <input
                    value={initShardIdInput}
                    onChange={(e) => setInitShardIdInput(e.target.value)}
                    inputMode="numeric"
                    className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                    Shard seed
                  </div>
                  <input
                    value={initShardSeedInput}
                    onChange={(e) => setInitShardSeedInput(e.target.value)}
                    inputMode="text"
                    className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                    Rotate matcher authority
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-300">
                    Updates the on-chain matcher authority used to co-sign trades.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRotateMatcherAuthority}
                  disabled={!ready || isSubmitting}
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
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Crank freshness
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-300">
              {crankStalenessSlots === null ? (
                "Slot unknown"
              ) : (
                <>
                  Last crank:{" "}
                  <span className="font-mono">{lastCrankSlot.toString(10)}</span>{" "}
                  ({crankStalenessSlots.toString(10)} slots ago)
                </>
              )}
              {isCrankStale === true ? (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Stale
                </span>
              ) : null}
              {isCrankStale === false ? (
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                  Fresh
                </span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCrank}
            disabled={!ready || isSubmitting}
            className="inline-flex h-9 items-center justify-center rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-50"
          >
            Crank now
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
            Account
          </div>
          <div className="text-xs text-zinc-600 dark:text-zinc-300">
            Collateral balance:{" "}
            <span className="font-mono">
              {formatFixedDecimal(balance, 6)} USDC
            </span>
          </div>
          <div className="text-xs text-zinc-600 dark:text-zinc-300">
            Position:{" "}
            <span className="font-mono">
              {formatSignedFixedDecimal(positionSizeQ, 6)} SOL
            </span>
            {positionSizeQ !== 0n && lastExecPrice > 0n ? (
              <>
                {" "}
                @{" "}
                <span className="font-mono">
                  {formatFixedDecimal(lastExecPrice, 6)} USD
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleOpenTrader}
            disabled={!ready || isSubmitting || hasTrader}
            className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
          >
            {hasTrader ? "Account opened" : "Open account"}
          </button>

          <div className="flex flex-1 items-center gap-2">
            <input
              value={depositInput}
              onChange={(e) => setDepositInput(e.target.value)}
              placeholder="10"
              inputMode="decimal"
              className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
            />
            <button
              type="button"
              onClick={handleDeposit}
              disabled={!ready || isSubmitting || !hasTrader}
              className="inline-flex h-9 items-center justify-center rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-50"
            >
              Deposit
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2">
            <input
              value={withdrawInput}
              onChange={(e) => setWithdrawInput(e.target.value)}
              placeholder="5"
              inputMode="decimal"
              className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
            />
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={!ready || isSubmitting || !hasTrader}
              className="inline-flex h-9 items-center justify-center rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-50"
            >
              Withdraw
            </button>
          </div>
        </div>

        <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
          Vault ATA is derived from <span className="font-mono">{props.shard}</span>{" "}
          and <span className="font-mono">{props.collateralMint}</span>.
        </div>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                Trade (IOC)
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-300">
                {quote ? (
                  <>
                    Exec price:{" "}
                    <span className="font-mono">
                      {formatFixedDecimal(quote.execPrice, 6)} USD
                    </span>{" "}
                    (oracle{" "}
                    <span className="font-mono">
                      {formatFixedDecimal(quote.oraclePrice, 6)} USD
                    </span>
                    , posted slot{" "}
                    <span className="font-mono">
                      {quote.oraclePostedSlot.toString(10)}
                    </span>
                    )
                  </>
                ) : (
                  "Request a quote, then submit a co-signed trade."
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleQuote}
                disabled={!ready || isSubmitting || !hasTrader}
                className="inline-flex h-9 items-center justify-center rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-50"
              >
                Quote
              </button>
              <button
                type="button"
                onClick={handleTrade}
                disabled={!ready || isSubmitting || !hasTrader || !quote}
                className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
              >
                Trade
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setTradeSide("long")
                  setQuote(null)
                }}
                disabled={isSubmitting}
                className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium disabled:opacity-50 ${
                  tradeSide === "long"
                    ? "border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                    : "border-black/10 bg-white text-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50"
                }`}
              >
                Long
              </button>
              <button
                type="button"
                onClick={() => {
                  setTradeSide("short")
                  setQuote(null)
                }}
                disabled={isSubmitting}
                className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium disabled:opacity-50 ${
                  tradeSide === "short"
                    ? "border-rose-500/30 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-200"
                    : "border-black/10 bg-white text-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50"
                }`}
              >
                Short
              </button>
            </div>

            <div className="flex flex-1 items-center gap-2">
              <input
                value={tradeSizeInput}
                onChange={(e) => {
                  setTradeSizeInput(e.target.value)
                  setQuote(null)
                }}
                placeholder="0.1"
                inputMode="decimal"
                className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
              <span className="text-xs text-zinc-600 dark:text-zinc-300">SOL</span>
            </div>
          </div>

          {isCrankStale === true ? (
            <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
              Crank is stale. This trade will prepend a crank backstop.
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Liquidation (permissionless)
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-300">
              Anyone can submit a liquidation transaction for a given engine index. If the account
              is healthy, the program will no-op.
            </div>
          </div>
          <button
            type="button"
            onClick={handleLiquidate}
            disabled={!ready || isSubmitting}
            className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
          >
            Liquidate
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={liquidateeEngineIndexInput}
            onChange={(e) => setLiquidateeEngineIndexInput(e.target.value)}
            placeholder={trader?.engineIndex?.toString(10) ?? "0"}
            inputMode="numeric"
            className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
          />
          <span className="text-xs text-zinc-600 dark:text-zinc-300">engine index</span>
        </div>

        {liquidations?.length ? (
          <div className="mt-4 border-t border-black/10 pt-4 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300">
            <div className="font-medium text-zinc-950 dark:text-zinc-50">
              Your liquidation history
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {liquidations.slice(0, 5).map((l) => {
                const nowSlot = toBigInt(l.nowSlot) ?? 0n
                const oraclePrice = toBigInt(l.oraclePrice) ?? 0n
                const effQ = toBigInt(l.oldEffectivePosQ) ?? 0n
                return (
                  <div key={l._id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono">{l.signature.slice(0, 8)}…</span>
                    <span>{l.liquidated ? "LIQUIDATED" : "no-op"}</span>
                    <span className="font-mono">
                      idx {l.liquidateeEngineIndex.toString(10)}
                    </span>
                    <span className="font-mono">{formatSignedFixedDecimal(effQ, 6)} SOL</span>
                    <span className="font-mono">{formatFixedDecimal(oraclePrice, 6)} USD</span>
                    <span className="font-mono">slot {nowSlot.toString(10)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Activity</div>
        <div className="mt-3 flex flex-col gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          {activityEvents?.length ? (
            activityEvents.slice(0, 20).map((e) => {
              const slot = toBigInt(e.slot) ?? 0n

              if (e.type === "Deposit") {
                const amount = toBigInt(e.amount) ?? 0n
                return (
                  <div key={e.signature} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
                      Deposit
                    </span>
                    <span className="font-mono">{e.signature.slice(0, 8)}…</span>
                    <span className="font-mono">{formatFixedDecimal(amount, 6)} USDC</span>
                    <span className="font-mono">slot {slot.toString(10)}</span>
                  </div>
                )
              }

              if (e.type === "Withdrawal") {
                const amount = toBigInt(e.amount) ?? 0n
                return (
                  <div key={e.signature} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
                      Withdrawal
                    </span>
                    <span className="font-mono">{e.signature.slice(0, 8)}…</span>
                    <span className="font-mono">{formatFixedDecimal(amount, 6)} USDC</span>
                    <span className="font-mono">slot {slot.toString(10)}</span>
                  </div>
                )
              }

              if (e.type === "TradeExecuted") {
                const sizeQ = toBigInt(e.sizeQ) ?? 0n
                const execPrice = toBigInt(e.execPrice) ?? 0n
                return (
                  <div key={e.signature} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
                      Trade
                    </span>
                    <span className="font-mono">{e.signature.slice(0, 8)}…</span>
                    <span className="font-mono">{formatSignedFixedDecimal(sizeQ, 6)} SOL</span>
                    <span className="font-mono">@ {formatFixedDecimal(execPrice, 6)} USD</span>
                    <span className="font-mono">slot {slot.toString(10)}</span>
                  </div>
                )
              }

              const liquidated = e.liquidated ? "LIQUIDATED" : "no-op"
              return (
                <div key={e.signature} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
                    Liquidation
                  </span>
                  <span className="font-mono">{e.signature.slice(0, 8)}…</span>
                  <span>{liquidated}</span>
                  <span className="font-mono">idx {e.liquidateeEngineIndex.toString(10)}</span>
                  <span className="font-mono">slot {slot.toString(10)}</span>
                </div>
              )
            })
          ) : (
            <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
              No activity yet.
            </div>
          )}
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-red-700 dark:border-white/10 dark:bg-black dark:text-red-300">
          {errorMessage}
        </div>
      ) : null}

      {signature ? (
        <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-black dark:text-zinc-200">
          Signature: <span className="font-mono">{signature}</span>
        </div>
      ) : null}
    </div>
  )
}


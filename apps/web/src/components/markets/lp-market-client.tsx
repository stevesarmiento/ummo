"use client"

import {
  address,
  createSolanaRpc,
  type Address,
  type Instruction,
} from "@solana/kit"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  getClaimLpWithdrawInstruction,
  getAssociatedTokenAddress,
  getDepositLpInstruction,
  getEngineAddress,
  getInitLpPoolInstruction,
  getLpBandConfigAddress,
  getLpPoolAddress,
  getLpPositionAddress,
  getRequestLpWithdrawInstruction,
  getSetLpBandConfigInstruction,
} from "@ummo/sdk"

import type { MarketSummary } from "@/lib/market-data"
import {
  formatAddress,
  formatFixedDecimal,
  formatSignedFixedDecimal,
  parseFixedDecimal,
  toBigInt,
} from "@/lib/market-format"
import { convexQuery } from "@/lib/convex-http"

import {
  getCreateAssociatedTokenAccountInstruction,
  getMintTokenProgramAddress,
  useIndexedTransactionSender,
} from "./market-client-utils"

export interface LpMarketClientProps {
  market: string
  authority: string
  collateralMint: string
  oracleFeed: string
  shard: string | null
  summary: MarketSummary | null
}

interface LpPoolDoc {
  lpPool: string
  pooledEngineIndex: number
  lpFeeBps: number
  protocolFeeBps: number
  totalShares: unknown
  accountingNav: unknown
  totalDeposited: unknown
  protocolFeeAccrued: unknown
  cashNav?: unknown
  estimatedNav?: unknown
  pendingRedemptionShares?: unknown
  pendingRedemptionValue?: unknown
}

interface LpPositionDoc {
  lpPool: string
  owner: string
  lpPosition: string
  shares: unknown
  depositedTotal: unknown
  lockedShares?: unknown
  pendingWithdrawShares?: unknown
  pendingWithdrawAmount?: unknown
  pendingWithdrawClaimableAtSlot?: unknown
}

interface LpBandDoc {
  lpBandConfig: string
  firstBandMaxNotional: unknown
  firstBandSpreadBps: number
  firstBandMaxOracleDeviationBps: number
  firstBandMaxInventoryBps: number
  secondBandMaxNotional: unknown
  secondBandSpreadBps: number
  secondBandMaxOracleDeviationBps: number
  secondBandMaxInventoryBps: number
  thirdBandMaxNotional: unknown
  thirdBandSpreadBps: number
  thirdBandMaxOracleDeviationBps: number
  thirdBandMaxInventoryBps: number
}

function applyPreset(
  preset: "tight" | "balanced" | "wide",
): Array<{
  maxNotional: string
  spreadBps: string
  maxOracleDeviationBps: string
  maxInventoryBps: string
}> {
  if (preset === "tight") {
    return [
      { maxNotional: "250", spreadBps: "8", maxOracleDeviationBps: "40", maxInventoryBps: "2500" },
      { maxNotional: "500", spreadBps: "15", maxOracleDeviationBps: "75", maxInventoryBps: "3500" },
      { maxNotional: "1000", spreadBps: "30", maxOracleDeviationBps: "120", maxInventoryBps: "4500" },
    ]
  }

  if (preset === "wide") {
    return [
      { maxNotional: "500", spreadBps: "20", maxOracleDeviationBps: "75", maxInventoryBps: "3000" },
      { maxNotional: "1500", spreadBps: "45", maxOracleDeviationBps: "150", maxInventoryBps: "5000" },
      { maxNotional: "3000", spreadBps: "90", maxOracleDeviationBps: "250", maxInventoryBps: "7000" },
    ]
  }

  return [
    { maxNotional: "300", spreadBps: "10", maxOracleDeviationBps: "50", maxInventoryBps: "2500" },
    { maxNotional: "900", spreadBps: "25", maxOracleDeviationBps: "120", maxInventoryBps: "4500" },
    { maxNotional: "1800", spreadBps: "55", maxOracleDeviationBps: "220", maxInventoryBps: "6500" },
  ]
}

export function LpMarketClient(props: LpMarketClientProps) {
  const { client, ready, sendAndIndex, signer } = useIndexedTransactionSender()
  const ownerAddress = signer?.address as Address | undefined

  const marketAddress = useMemo(() => address(props.market), [props.market])
  const authorityAddress = useMemo(() => address(props.authority), [props.authority])
  const collateralMintAddress = useMemo(
    () => address(props.collateralMint),
    [props.collateralMint],
  )
  const oracleFeedAddress = useMemo(() => address(props.oracleFeed), [props.oracleFeed])
  const shardAddress = useMemo(
    () => (props.shard ? address(props.shard) : null),
    [props.shard],
  )
  const isMarketAuthority = ownerAddress === authorityAddress

  const [derived, setDerived] = useState<{
    engine: string | null
    lpPool: string | null
    lpPosition: string | null
    lpBandConfig: string | null
  }>({
    engine: null,
    lpPool: null,
    lpPosition: null,
    lpBandConfig: null,
  })
  const [lpPool, setLpPool] = useState<LpPoolDoc | null>(null)
  const [lpPosition, setLpPosition] = useState<LpPositionDoc | null>(null)
  const [lpBands, setLpBands] = useState<LpBandDoc | null>(null)
  const [redemptions, setRedemptions] = useState<
    Array<{
      requestSignature: string
      requestedShares: unknown
      estimatedAmount: unknown
      claimableAtSlot: unknown
      status: "pending" | "claimed"
      claimSignature?: string
    }>
  >([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [lpDepositInput, setLpDepositInput] = useState("250")
  const [withdrawSharesInput, setWithdrawSharesInput] = useState("0")
  const [bandInputs, setBandInputs] = useState(() => applyPreset("balanced"))

  useEffect(() => {
    async function loadDerivedAddresses() {
      if (!shardAddress) {
        setDerived({
          engine: null,
          lpPool: null,
          lpPosition: null,
          lpBandConfig: null,
        })
        return
      }

      const engine = await getEngineAddress({ shard: shardAddress })
      const lpPoolAddress = await getLpPoolAddress({ shard: shardAddress })
      const nextDerived = {
        engine,
        lpPool: lpPoolAddress,
        lpPosition:
          ownerAddress != null
            ? await getLpPositionAddress({ lpPool: lpPoolAddress, owner: ownerAddress })
            : null,
        lpBandConfig:
          ownerAddress != null
            ? await getLpBandConfigAddress({ lpPool: lpPoolAddress, owner: ownerAddress })
            : null,
      }
      setDerived(nextDerived)
    }

    void loadDerivedAddresses()
  }, [ownerAddress, shardAddress])

  const refreshLpState = useCallback(async () => {
    if (!props.shard) {
      setLpPool(null)
      setLpPosition(null)
      setLpBands(null)
      return
    }

    const pool = await convexQuery<LpPoolDoc | null>("lpPools:getByShard", {
      shard: props.shard,
    })
    setLpPool(pool)

    if (ownerAddress) {
      const positions = await convexQuery<LpPositionDoc[]>("lpPositions:listByOwnerMarket", {
        owner: ownerAddress,
        market: props.market,
      })
      setLpPosition(positions.find((position) => position.lpPool === pool?.lpPool) ?? null)
      const redemptionRows = await convexQuery<
        Array<{
          requestSignature: string
          requestedShares: unknown
          estimatedAmount: unknown
          claimableAtSlot: unknown
          status: "pending" | "claimed"
          claimSignature?: string
        }>
      >("lpRedemptions:listByOwnerMarket", {
        owner: ownerAddress,
        market: props.market,
      })
      setRedemptions(redemptionRows)
    } else {
      setLpPosition(null)
      setRedemptions([])
    }

    if (pool?.lpPool) {
      const bands = await convexQuery<LpBandDoc[]>("lpBands:listByPool", {
        lpPool: pool.lpPool,
      })
      const mine = bands.find((band) => band.lpBandConfig === derived.lpBandConfig) ?? null
      setLpBands(mine)
      if (mine) {
        setBandInputs([
          {
            maxNotional: `${(toBigInt(mine.firstBandMaxNotional) ?? 0n) / 1_000_000n}`,
            spreadBps: `${mine.firstBandSpreadBps}`,
            maxOracleDeviationBps: `${mine.firstBandMaxOracleDeviationBps}`,
            maxInventoryBps: `${mine.firstBandMaxInventoryBps}`,
          },
          {
            maxNotional: `${(toBigInt(mine.secondBandMaxNotional) ?? 0n) / 1_000_000n}`,
            spreadBps: `${mine.secondBandSpreadBps}`,
            maxOracleDeviationBps: `${mine.secondBandMaxOracleDeviationBps}`,
            maxInventoryBps: `${mine.secondBandMaxInventoryBps}`,
          },
          {
            maxNotional: `${(toBigInt(mine.thirdBandMaxNotional) ?? 0n) / 1_000_000n}`,
            spreadBps: `${mine.thirdBandSpreadBps}`,
            maxOracleDeviationBps: `${mine.thirdBandMaxOracleDeviationBps}`,
            maxInventoryBps: `${mine.thirdBandMaxInventoryBps}`,
          },
        ])
      }
    } else {
      setLpBands(null)
    }
  }, [derived.lpBandConfig, ownerAddress, props.market, props.shard])

  useEffect(() => {
    void refreshLpState()
  }, [refreshLpState])

  const clearMessages = useCallback(() => {
    setErrorMessage(null)
    setSuccessMessage(null)
  }, [])

  const handleInitPool = useCallback(async () => {
    clearMessages()
    if (!ownerAddress || !ready || !shardAddress || !derived.lpPool) return
    if (!isMarketAuthority) {
      setErrorMessage("Only the market authority can initialize the LP pool.")
      return
    }

    setIsSubmitting(true)
    try {
      const instruction = getInitLpPoolInstruction({
        payer: ownerAddress,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shard: shardAddress,
        lpPool: address(derived.lpPool),
      })
      await sendAndIndex([instruction])
      await refreshLpState()
      setSuccessMessage("LP pool initialized.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "LP pool init failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    clearMessages,
    derived.lpPool,
    isMarketAuthority,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    ready,
    refreshLpState,
    sendAndIndex,
    shardAddress,
  ])

  const handleDeposit = useCallback(async () => {
    clearMessages()
    if (
      !ownerAddress ||
      !client ||
      !shardAddress ||
      !derived.engine ||
      !derived.lpPool ||
      !derived.lpPosition
    )
      return

    const amount = parseFixedDecimal(lpDepositInput, 6)
    if (!amount || amount <= 0n) {
      setErrorMessage("Enter a valid LP deposit amount.")
      return
    }

    let userCollateral: Address | null = null
    let vaultCollateral: Address | null = null
    let tokenProgram: Address | null = null

    setIsSubmitting(true)
    try {
      const rpcUrl = client.getRpcUrl()
      if (!rpcUrl) throw new Error("No RPC endpoint configured")
      const rpc = createSolanaRpc(rpcUrl)
      tokenProgram = await getMintTokenProgramAddress({
        rpc,
        mint: collateralMintAddress,
      })
      userCollateral = await getAssociatedTokenAddress({
        owner: ownerAddress,
        mint: collateralMintAddress,
        tokenProgram,
      })
      vaultCollateral = await getAssociatedTokenAddress({
        owner: shardAddress,
        mint: collateralMintAddress,
        tokenProgram,
      })

      const instructions: Instruction[] = []
      const userAccount = await rpc.getAccountInfo(userCollateral, { encoding: "base64" }).send()
      if (!userAccount.value) {
        instructions.push(
          getCreateAssociatedTokenAccountInstruction({
            payer: ownerAddress,
            associatedToken: userCollateral,
            owner: ownerAddress,
            mint: collateralMintAddress,
            tokenProgram,
          }),
        )
      }
      const userBalanceAmount = userAccount.value
        ? BigInt((await rpc.getTokenAccountBalance(userCollateral).send()).value.amount)
        : 0n
      if (userBalanceAmount < amount) {
        throw new Error(
          `Insufficient token balance for ${formatAddress(collateralMintAddress)}. Need ${formatFixedDecimal(amount, 6)} and have ${formatFixedDecimal(userBalanceAmount, 6)}.`,
        )
      }
      const vaultAccount = await rpc.getAccountInfo(vaultCollateral, { encoding: "base64" }).send()
      if (!vaultAccount.value) {
        instructions.push(
          getCreateAssociatedTokenAccountInstruction({
            payer: ownerAddress,
            associatedToken: vaultCollateral,
            owner: shardAddress,
            mint: collateralMintAddress,
            tokenProgram,
          }),
        )
      }

      const depositInstruction = getDepositLpInstruction({
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
      })
      instructions.push(depositInstruction)

      await sendAndIndex(instructions)
      await refreshLpState()
      setSuccessMessage("Liquidity deposited into the pool.")
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("DepositLp") &&
        userCollateral &&
        vaultCollateral &&
        tokenProgram
      ) {
        const depositInstruction = getDepositLpInstruction({
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
        })
        const builtAccounts =
          depositInstruction.accounts
            ?.map((account, index) => `${index}:${account.address}:${account.role}`)
            .join(", ") ??
          "none"
        setErrorMessage(`${error.message}\nBuilt DepositLp accounts: ${builtAccounts}`)
      } else {
        setErrorMessage(error instanceof Error ? error.message : "LP deposit failed")
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [
    clearMessages,
    client,
    collateralMintAddress,
    derived.engine,
    derived.lpPool,
    derived.lpPosition,
    lpDepositInput,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refreshLpState,
    sendAndIndex,
    shardAddress,
  ])

  const handleSetPreset = useCallback((preset: "tight" | "balanced" | "wide") => {
    clearMessages()
    setBandInputs(applyPreset(preset))
  }, [clearMessages])

  const handleUpdateBandInput = useCallback(
    (
      index: number,
      key: "maxNotional" | "spreadBps" | "maxOracleDeviationBps" | "maxInventoryBps",
      value: string,
    ) => {
      setBandInputs((current) =>
        current.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, [key]: value } : entry,
        ),
      )
    },
    [],
  )

  const handleSaveBands = useCallback(async () => {
    clearMessages()
    if (!ownerAddress || !shardAddress || !derived.lpPool || !derived.lpBandConfig) return

    const bands = bandInputs.map((band) => ({
      maxNotional: BigInt(band.maxNotional || "0") * 1_000_000n,
      spreadBps: Number(band.spreadBps),
      maxOracleDeviationBps: Number(band.maxOracleDeviationBps),
      maxInventoryBps: Number(band.maxInventoryBps),
    }))

    if (
      bands.some(
        (band) =>
          band.maxNotional <= 0n ||
          band.spreadBps <= 0 ||
          band.maxOracleDeviationBps <= 0 ||
          band.maxInventoryBps <= 0,
      )
    ) {
      setErrorMessage("Every band needs positive notional, spread, deviation, and inventory limits.")
      return
    }

    setIsSubmitting(true)
    try {
      const instruction = getSetLpBandConfigInstruction({
        owner: ownerAddress,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shard: shardAddress,
        lpPool: address(derived.lpPool),
        lpBandConfig: address(derived.lpBandConfig),
        bands,
      })
      await sendAndIndex([instruction])
      await refreshLpState()
      setSuccessMessage("Band strategy saved.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Band save failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    bandInputs,
    clearMessages,
    derived.lpBandConfig,
    derived.lpPool,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refreshLpState,
    sendAndIndex,
    shardAddress,
  ])

  const handleRequestWithdraw = useCallback(async () => {
    clearMessages()
    if (!ownerAddress || !shardAddress || !derived.lpPool || !derived.lpPosition) return
    const requestedShares = parseFixedDecimal(withdrawSharesInput, 6)
    if (!requestedShares || requestedShares <= 0n) {
      setErrorMessage("Enter a valid share amount to withdraw.")
      return
    }

    setIsSubmitting(true)
    try {
      const instruction = getRequestLpWithdrawInstruction({
        owner: ownerAddress,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shard: shardAddress,
        lpPool: address(derived.lpPool),
        lpPosition: address(derived.lpPosition),
        shares: requestedShares,
      })
      await sendAndIndex([instruction])
      await refreshLpState()
      setSuccessMessage("Redemption request submitted.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Withdrawal request failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    clearMessages,
    derived.lpPool,
    derived.lpPosition,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refreshLpState,
    sendAndIndex,
    shardAddress,
    withdrawSharesInput,
  ])

  const handleClaimWithdraw = useCallback(async () => {
    clearMessages()
    if (
      !ownerAddress ||
      !shardAddress ||
      !derived.engine ||
      !derived.lpPool ||
      !derived.lpPosition
    )
      return

    setIsSubmitting(true)
    try {
      if (!client) throw new Error("Wallet not connected")
      const rpcUrl = client.getRpcUrl()
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
      const instructions: Instruction[] = []
      const userAccount = await rpc.getAccountInfo(userCollateral, { encoding: "base64" }).send()
      if (!userAccount.value) {
        instructions.push(
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
        instructions.push(
          getCreateAssociatedTokenAccountInstruction({
            payer: ownerAddress,
            associatedToken: vaultCollateral,
            owner: shardAddress,
            mint: collateralMintAddress,
            tokenProgram,
          }),
        )
      }
      instructions.push(
        getClaimLpWithdrawInstruction({
          owner: ownerAddress,
          oracleFeed: oracleFeedAddress,
          market: marketAddress,
          shard: shardAddress,
          engine: address(derived.engine),
          lpPool: address(derived.lpPool),
          lpPosition: address(derived.lpPosition),
          collateralMint: collateralMintAddress,
          userCollateral,
          vaultCollateral,
          tokenProgram,
        }),
      )
      await sendAndIndex(instructions)
      await refreshLpState()
      setSuccessMessage("Redemption claimed.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Claim failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    clearMessages,
    client,
    collateralMintAddress,
    derived.engine,
    derived.lpPool,
    derived.lpPosition,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refreshLpState,
    sendAndIndex,
    shardAddress,
  ])

  const poolNav = toBigInt(lpPool?.estimatedNav ?? lpPool?.accountingNav ?? props.summary?.totalPoolNav) ?? 0n
  const cashNav = toBigInt(lpPool?.cashNav ?? lpPool?.accountingNav) ?? 0n
  const totalShares = toBigInt(lpPool?.totalShares) ?? 0n
  const yourShares = toBigInt(lpPosition?.shares ?? props.summary?.yourLpShares) ?? 0n
  const yourLockedShares = toBigInt(lpPosition?.lockedShares) ?? 0n
  const yourValue = toBigInt(props.summary?.yourLpValue) ?? 0n
  const lpPnlEstimate = toBigInt(props.summary?.lpPnlEstimate) ?? 0n
  const pendingWithdrawShares = toBigInt(lpPosition?.pendingWithdrawShares) ?? 0n
  const pendingWithdrawAmount = toBigInt(lpPosition?.pendingWithdrawAmount) ?? 0n
  const claimableAtSlot = toBigInt(lpPosition?.pendingWithdrawClaimableAtSlot)
  const shareBps = totalShares > 0n ? Number((yourShares * 10_000n) / totalShares) : 0
  const hasShard = Boolean(props.shard)

  return (
    <div className="grid grid-cols-1 gap-4">
      {!hasShard ? (
        <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-black dark:text-zinc-200">
          This market has no indexed shard yet, so LP pool setup and strategy management stay unavailable.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
          {successMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                Pool overview
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                Provide liquidity into the pooled balance sheet and configure how your capital is quoted.
              </p>
            </div>
            {hasShard && !lpPool && isMarketAuthority ? (
              <button
                type="button"
                onClick={handleInitPool}
                disabled={!ready || isSubmitting}
                className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 px-4 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-white/10 dark:text-zinc-50"
              >
                Init LP pool
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Estimated NAV</div>
              <div className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {formatFixedDecimal(poolNav, 6)} USDC
              </div>
            </div>
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Cash NAV</div>
              <div className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {formatFixedDecimal(cashNav, 6)} USDC
              </div>
            </div>
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Configured depth</div>
              <div className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {formatFixedDecimal(toBigInt(props.summary?.configuredDepthNotional) ?? 0n, 6)} USDC
              </div>
            </div>
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">LP PnL est.</div>
              <div className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {formatSignedFixedDecimal(lpPnlEstimate, 6)} USDC
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-zinc-600 dark:text-zinc-300 md:grid-cols-2">
            <div>
              Market authority <span className="font-mono">{formatAddress(props.authority)}</span>
            </div>
            <div>
              Oracle feed <span className="font-mono">{formatAddress(props.oracleFeed)}</span>
            </div>
            <div>
              LP pool <span className="font-mono">{lpPool?.lpPool ? formatAddress(lpPool.lpPool) : "Not initialized"}</span>
            </div>
            <div>
              Shard <span className="font-mono">{props.shard ? formatAddress(props.shard) : "None"}</span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Your LP state
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Shares</div>
              <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                {formatFixedDecimal(yourShares, 6)}
              </div>
            </div>
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Estimated value</div>
              <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                {formatFixedDecimal(yourValue, 6)} USDC
              </div>
            </div>
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Locked shares</div>
              <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                {formatFixedDecimal(yourLockedShares, 6)}
              </div>
            </div>
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Pool share</div>
              <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                {(shareBps / 100).toFixed(2)}%
              </div>
            </div>
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Pending redemption</div>
              <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                {formatFixedDecimal(pendingWithdrawAmount, 6)} USDC
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Provide liquidity
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Deposit collateral into the pooled LP balance sheet and receive proportional ownership.
          </p>

          <div className="mt-4 flex items-center gap-3">
            <input
              value={lpDepositInput}
              onChange={(event) => setLpDepositInput(event.target.value)}
              placeholder="250"
              inputMode="decimal"
              className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
            />
            <button
              type="button"
              onClick={handleDeposit}
              disabled={!ready || isSubmitting || !hasShard || !lpPool}
              className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
            >
              Deposit
            </button>
          </div>
          <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">USDC</div>

          <div className="mt-6">
            <h3 className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Withdraw / redeem
            </h3>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              Request shares to redeem, then claim once the cooldown expires and liquidity is available.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <input
                value={withdrawSharesInput}
                onChange={(event) => setWithdrawSharesInput(event.target.value)}
                placeholder="0"
                inputMode="decimal"
                className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
              <button
                type="button"
                onClick={handleRequestWithdraw}
                disabled={isSubmitting || !ownerAddress}
                className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 px-4 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-white/10 dark:text-zinc-50"
              >
                Request
              </button>
            </div>
            {pendingWithdrawShares > 0n ? (
              <div className="mt-3 rounded-xl border border-black/10 p-4 text-sm dark:border-white/10">
                <div className="text-zinc-700 dark:text-zinc-200">
                  Pending: {formatFixedDecimal(pendingWithdrawShares, 6)} shares for{" "}
                  {formatFixedDecimal(pendingWithdrawAmount, 6)} USDC
                </div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Claimable at slot {claimableAtSlot?.toString(10) ?? "unknown"}
                </div>
                <button
                  type="button"
                  onClick={handleClaimWithdraw}
                  disabled={isSubmitting}
                  className="mt-3 inline-flex h-9 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
                >
                  Claim redemption
                </button>
              </div>
            ) : null}
            {redemptions.length ? (
              <div className="mt-3 flex flex-col gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                {redemptions.slice(0, 3).map((redemption) => (
                  <div
                    key={redemption.requestSignature}
                    className="rounded-xl border border-black/10 p-3 dark:border-white/10"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
                        {redemption.status}
                      </span>
                      <span className="font-mono">
                        {formatFixedDecimal(toBigInt(redemption.requestedShares) ?? 0n, 6)} shares
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                Quote strategy
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                Start from a preset, then tune the three live bands if you want more control.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveBands}
              disabled={!ready || isSubmitting || !hasShard || !lpPool}
              className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
            >
              Save bands
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(["tight", "balanced", "wide"] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleSetPreset(preset)}
                className="inline-flex h-8 items-center justify-center rounded-full border border-black/10 px-3 text-xs font-medium text-zinc-700 dark:border-white/10 dark:text-zinc-200"
              >
                {preset}
              </button>
            ))}
          </div>

          {lpBands ? (
            <div className="mt-4 rounded-xl border border-black/10 p-4 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300">
              <div className="font-medium text-zinc-950 dark:text-zinc-50">Current live bands</div>
              <div className="mt-2 flex flex-col gap-1">
                <div>
                  Band 1: {formatFixedDecimal(toBigInt(lpBands.firstBandMaxNotional) ?? 0n, 6)} USDC at{" "}
                  <span className="font-mono">{lpBands.firstBandSpreadBps}bps</span>
                </div>
                <div>
                  Band 2: {formatFixedDecimal(toBigInt(lpBands.secondBandMaxNotional) ?? 0n, 6)} USDC at{" "}
                  <span className="font-mono">{lpBands.secondBandSpreadBps}bps</span>
                </div>
                <div>
                  Band 3: {formatFixedDecimal(toBigInt(lpBands.thirdBandMaxNotional) ?? 0n, 6)} USDC at{" "}
                  <span className="font-mono">{lpBands.thirdBandSpreadBps}bps</span>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {bandInputs.map((band, index) => (
              <div key={`band-${index}`} className="rounded-xl border border-black/10 p-4 dark:border-white/10">
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  Band {index + 1}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  <input
                    value={band.maxNotional}
                    onChange={(event) =>
                      handleUpdateBandInput(index, "maxNotional", event.target.value)
                    }
                    placeholder="Max notional"
                    inputMode="decimal"
                    className="h-9 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                  />
                  <input
                    value={band.spreadBps}
                    onChange={(event) =>
                      handleUpdateBandInput(index, "spreadBps", event.target.value)
                    }
                    placeholder="Spread bps"
                    inputMode="numeric"
                    className="h-9 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                  />
                  <input
                    value={band.maxOracleDeviationBps}
                    onChange={(event) =>
                      handleUpdateBandInput(index, "maxOracleDeviationBps", event.target.value)
                    }
                    placeholder="Oracle deviation bps"
                    inputMode="numeric"
                    className="h-9 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                  />
                  <input
                    value={band.maxInventoryBps}
                    onChange={(event) =>
                      handleUpdateBandInput(index, "maxInventoryBps", event.target.value)
                    }
                    placeholder="Inventory bps"
                    inputMode="numeric"
                    className="h-9 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

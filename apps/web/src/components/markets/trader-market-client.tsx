"use client"

import {
  address,
  createSolanaRpc,
  type Address,
  type Instruction,
} from "@solana/kit"
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"

import {
  getAssociatedTokenAddress,
  getDepositInstruction,
  getEngineAddress,
  getExecuteTradeInstruction,
  getKeeperCrankInstruction,
  getLpPoolAddress,
  getOpenTraderInstruction,
  getTraderAddress,
  getWithdrawInstruction,
} from "@ummo/sdk"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ummo/ui/tabs"

import type { MarketSummary } from "@/lib/market-data"
import {
  formatAddress,
  formatFixedDecimal,
  formatSignedFixedDecimal,
  parseFixedDecimal,
  toBigInt,
} from "@/lib/market-format"
import { convexAction, convexQuery } from "@/lib/convex-http"

import {
  decodeBase64,
  encodeBase64,
  getCreateAssociatedTokenAccountInstruction,
  getMintTokenProgramAddress,
  type HybridQuoteResult,
  useIndexedTransactionSender,
} from "./market-client-utils"

export interface TraderMarketClientProps {
  market: string
  collateralMint: string
  oracleFeed: string
  matcherAuthority: string
  shard: string | null
  lastCrankSlot: unknown
  summary: MarketSummary | null
}

function isOracleStalenessError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes("oracle is stale") ||
    lower.includes("too close to staleness cutoff")
  )
}

function extractOracleStalenessSlots(message: string): string | null {
  const match = message.match(/oracle is stale by\s+(\d+)\s+slots/i)
  return match?.[1] ?? null
}

interface TraderViewData {
  metadata: {
    defaultInputMode: "quote-notional" | "base-quantity"
    maxLeverageX100: number
    leveragePresetsX100: number[]
    minOrderNotional: string
    notionalStep: string
    quantityStepQ: string
    initialMarginBps: number
    maintenanceMarginBps: number
    removableCollateralBufferBps: number
    underlyingSymbol: string
    collateralSymbol: string
  }
  trader: {
    trader: string
    engineIndex: number
    collateralBalance: string
  } | null
  account: {
    collateralBalance: string
    usedMargin: string
    availableMargin: string
    equity: string
    effectiveLeverageX100: number
    removableCollateral: string
    initialMarginRequirement: string
    maintenanceMargin: string
    estimatedLiquidationPrice: string | null
    marginRatioBps: number
    riskTierLabel: string
  }
  positions: Array<{
    side: "long" | "short" | "flat"
    sizeQ: string
    notional: string
    averageEntryPrice: string
    markPrice: string
    unrealizedPnl: string
    realizedPnl: string
    leverageX100: number
    allocatedCollateral: string
    liquidationPrice: string | null
    removableCollateral: string
    canAddCollateral: boolean
    canRemoveCollateral: boolean
    canClose: boolean
  }>
  activity: Array<
    | {
        type: "TradeExecuted"
        signature: string
        slot: string
        indexedAt: number
        sizeQ: string
        execPrice: string
        effectiveSpreadBps: number
        usedFallback: boolean
        fallbackNotional: string
      }
    | {
        type: "Deposit" | "Withdrawal"
        signature: string
        slot: string
        indexedAt: number
        amount: string
      }
    | {
        type: "Liquidation"
        signature: string
        slot: string
        indexedAt: number
        liquidated: boolean
      }
  >
}

interface CollateralPreview {
  collateralBalance: string
  effectiveLeverageX100: number
  removableCollateral: string
  equity: string
  availableMargin: string
  estimatedLiquidationPrice: string | null
  marginRatioBps: number
}

function formatLeverageX100(value: number): string {
  return `${(value / 100).toFixed(2)}x`
}

function getDiffBps(execPrice: bigint, oraclePrice: bigint): number {
  if (oraclePrice <= 0n) return 0
  return Number((absBigInt(execPrice - oraclePrice) * 10_000n) / oraclePrice)
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value
}

function MiniChartPlaceholder() {
  return (
    <div className="rounded-2xl border border-black/10 bg-gradient-to-br from-zinc-100 via-white to-zinc-50 p-4 dark:border-white/10 dark:from-zinc-900 dark:via-black dark:to-zinc-950">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Mini chart</div>
          <div className="mt-1 text-sm font-medium text-zinc-950 dark:text-zinc-50">
            Devnet placeholder
          </div>
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">24h stub</div>
      </div>
      <div className="mt-4 h-20 w-full">
        <svg viewBox="0 0 320 80" className="h-full w-full">
          <path
            d="M0 55 C30 30, 55 25, 80 38 S130 75, 160 45 S215 18, 240 34 S285 60, 320 26"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-zinc-400 dark:text-zinc-500"
          />
        </svg>
      </div>
    </div>
  )
}

export function TraderMarketClient(props: TraderMarketClientProps) {
  const { client, ready, sendAndIndex, signer } = useIndexedTransactionSender()
  const ownerAddress = signer?.address as Address | undefined

  const marketAddress = useMemo(() => address(props.market), [props.market])
  const collateralMintAddress = useMemo(
    () => address(props.collateralMint),
    [props.collateralMint],
  )
  const oracleFeedAddress = useMemo(() => address(props.oracleFeed), [props.oracleFeed])
  const matcherAuthorityAddress = useMemo(
    () => address(props.matcherAuthority),
    [props.matcherAuthority],
  )
  const shardAddress = useMemo(
    () => (props.shard ? address(props.shard) : null),
    [props.shard],
  )

  const [derived, setDerived] = useState<{
    engine: string | null
    lpPool: string | null
    trader: string | null
  }>({
    engine: null,
    lpPool: null,
    trader: null,
  })
  const [traderView, setTraderView] = useState<TraderViewData | null>(null)
  const [hasOnchainTraderAccount, setHasOnchainTraderAccount] = useState(false)
  const [hybridQuote, setHybridQuote] = useState<HybridQuoteResult | null>(null)
  const [tradeSide, setTradeSide] = useState<"long" | "short">("long")
  const [notionalInput, setNotionalInput] = useState("1000")
  const [leverageInput, setLeverageInput] = useState("5")
  const [depositInput, setDepositInput] = useState("100")
  const [withdrawInput] = useState("10")
  const [positionAction, setPositionAction] = useState<"add" | "remove" | null>(null)
  const [positionActionAmount, setPositionActionAmount] = useState("")
  const [collateralPreview, setCollateralPreview] = useState<CollateralPreview | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isQuoteLoading, setIsQuoteLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("positions")
  const [resolvedMatcherAuthority, setResolvedMatcherAuthority] = useState(
    matcherAuthorityAddress,
  )

  const matcherSigner = useMemo(() => {
    return {
      address: resolvedMatcherAuthority,
      signTransactions: async (
        transactions: readonly { messageBytes: Uint8Array }[],
      ) => {
        const messageBase64s = transactions.map((transaction) =>
          encodeBase64(transaction.messageBytes),
        )

        const lastCrankSlot = (toBigInt(props.lastCrankSlot) ?? 0n).toString(10)
        const delaysMs = [400, 800, 1_200, 2_000, 3_000]
        for (let attempt = 0; attempt < delaysMs.length; attempt += 1) {
          try {
            const result = await convexAction<{
              signaturesBase64: string[]
            }>("matcher:signTransactions", {
              signer: resolvedMatcherAuthority,
              oracleFeed: oracleFeedAddress,
              lastCrankSlot,
              willCrank: true,
              messageBase64s,
            })

            return result.signaturesBase64.map((signatureBase64) => ({
              [resolvedMatcherAuthority]: decodeBase64(signatureBase64),
            }))
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Matcher signature request failed"
            if (!isOracleStalenessError(message) || attempt === delaysMs.length - 1) throw error
            await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt] ?? 1_000))
          }
        }

        throw new Error("Matcher signature request failed")
      },
    }
  }, [
    props.lastCrankSlot,
    oracleFeedAddress,
    resolvedMatcherAuthority,
  ])

  useEffect(() => {
    let cancelled = false
    async function resolveOnchainMatcherAuthority() {
      try {
        const result = await convexAction<{ matcherAuthority: string }>(
          "matcher:getOnchainMarketMatcher",
          { market: marketAddress },
        )
        if (!cancelled) {
          setResolvedMatcherAuthority(address(result.matcherAuthority))
        }
      } catch {
        if (!cancelled) setResolvedMatcherAuthority(matcherAuthorityAddress)
      }
    }
    void resolveOnchainMatcherAuthority()
    return () => {
      cancelled = true
    }
  }, [marketAddress, matcherAuthorityAddress])

  useEffect(() => {
    async function loadDerivedAddresses() {
      if (!shardAddress || !ownerAddress) {
        setDerived({
          engine: null,
          lpPool: shardAddress ? await getLpPoolAddress({ shard: shardAddress }) : null,
          trader: null,
        })
        return
      }

      const [engine, lpPool, traderAddress] = await Promise.all([
        getEngineAddress({ shard: shardAddress }),
        getLpPoolAddress({ shard: shardAddress }),
        getTraderAddress({ shard: shardAddress, owner: ownerAddress }),
      ])
      setDerived({
        engine,
        lpPool,
        trader: traderAddress,
      })
    }

    void loadDerivedAddresses()
  }, [ownerAddress, shardAddress])

  const refreshTraderView = useCallback(async () => {
    if (!ownerAddress || !props.shard) {
      setTraderView(null)
      setHasOnchainTraderAccount(false)
      return
    }

    const nextView = await convexQuery<TraderViewData>(
      "traderViews:getByOwnerMarketShard",
      {
        owner: ownerAddress,
        market: props.market,
        shard: props.shard,
      },
    )
    setTraderView(nextView)
    if (client && derived.trader) {
      const rpcUrl = client.getRpcUrl()
      if (rpcUrl) {
        const rpc = createSolanaRpc(rpcUrl)
        const accountInfo = await rpc
          .getAccountInfo(address(derived.trader), { encoding: "base64" })
          .send()
        setHasOnchainTraderAccount(Boolean(accountInfo.value))
      }
    }
    if (!leverageInput) {
      const preset = nextView.metadata.leveragePresetsX100[2] ?? nextView.metadata.maxLeverageX100
      setLeverageInput((preset / 100).toString())
    }
  }, [client, derived.trader, leverageInput, ownerAddress, props.market, props.shard])

  useEffect(() => {
    void refreshTraderView()
  }, [refreshTraderView])

  const clearMessages = useCallback(() => {
    setErrorMessage(null)
    setSuccessMessage(null)
  }, [])

  const desiredNotional = useMemo(
    () => parseFixedDecimal(notionalInput, 6) ?? 0n,
    [notionalInput],
  )
  const selectedLeverageX100 = useMemo(() => {
    const value = Number(leverageInput)
    if (!Number.isFinite(value) || value <= 0) return 0
    return Math.round(value * 100)
  }, [leverageInput])
  const maxLeverageX100 = traderView?.metadata.maxLeverageX100 ?? 1_000
  const boundedLeverageX100 = Math.min(
    Math.max(selectedLeverageX100 || 100, 100),
    maxLeverageX100,
  )
  const minOrderNotional = toBigInt(traderView?.metadata.minOrderNotional) ?? 0n
  const notionalStep = toBigInt(traderView?.metadata.notionalStep) ?? 1_000_000n
  const isNotionalStepAligned =
    desiredNotional > 0n && notionalStep > 0n ? desiredNotional % notionalStep === 0n : false
  const isNotionalValid =
    desiredNotional >= minOrderNotional && isNotionalStepAligned

  useEffect(() => {
    if (!ownerAddress || !shardAddress || desiredNotional <= 0n) {
      setHybridQuote(null)
      return
    }

    let cancelled = false

    const timeout = window.setTimeout(() => {
      void (async () => {
        setIsQuoteLoading(true)
        try {
          const delaysMs = [400, 800, 1_200, 2_000, 3_000, 5_000, 8_000]
          for (let attempt = 0; attempt < delaysMs.length; attempt += 1) {
            try {
              const quote = await convexAction<HybridQuoteResult>("matcher:getHybridQuote", {
                market: marketAddress,
                shard: shardAddress,
                oracleFeed: oracleFeedAddress,
                desiredNotional: desiredNotional.toString(),
                side: tradeSide,
                owner: ownerAddress,
              })
              if (cancelled) return
              setHybridQuote(quote)
              setErrorMessage(null)
              return
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Quote refresh failed"
              if (!isOracleStalenessError(message) || attempt === delaysMs.length - 1) {
                if (!cancelled) setErrorMessage(message)
                return
              }
              const stalenessSlots = extractOracleStalenessSlots(message)
              if (!cancelled) {
                setErrorMessage(
                  stalenessSlots
                    ? `Oracle is stale by ${stalenessSlots} slots; waiting for a fresh update…`
                    : "Oracle is stale; waiting for a fresh update…",
                )
              }
              await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt] ?? 1_000))
            }
          }
        } finally {
          if (!cancelled) setIsQuoteLoading(false)
        }
      })()
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [
    desiredNotional,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    shardAddress,
    tradeSide,
  ])

  useEffect(() => {
    if (!ownerAddress || !props.shard || !positionAction || !positionActionAmount.trim()) {
      setCollateralPreview(null)
      return
    }

    const amount = parseFixedDecimal(positionActionAmount, 6)
    if (!amount || amount <= 0n) {
      setCollateralPreview(null)
      return
    }
    if (
      positionAction === "remove" &&
      amount > (toBigInt(traderView?.account.removableCollateral) ?? 0n)
    ) {
      setCollateralPreview(null)
      return
    }

    const timeout = window.setTimeout(async () => {
      try {
        const preview = await convexQuery<CollateralPreview>(
          "traderViews:previewCollateralChange",
          {
            owner: ownerAddress,
            market: props.market,
            shard: props.shard!,
            deltaCollateral: (positionAction === "add" ? amount : -amount).toString(),
          },
        )
        setCollateralPreview(preview)
      } catch {
        setCollateralPreview(null)
      }
    }, 200)

    return () => window.clearTimeout(timeout)
  }, [
    ownerAddress,
    positionAction,
    positionActionAmount,
    props.market,
    props.shard,
    traderView?.account.removableCollateral,
  ])

  const handleOpenTrader = useCallback(async () => {
    clearMessages()
    if (!ownerAddress || !shardAddress || !derived.engine || !derived.trader) return

    if (hasOnchainTraderAccount) {
      setSuccessMessage("Trader account already exists for this shard.")
      return
    }

    setIsSubmitting(true)
    try {
      const instruction = getOpenTraderInstruction({
        owner: ownerAddress,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shard: shardAddress,
        engine: address(derived.engine),
        trader: address(derived.trader),
      })
      await sendAndIndex([instruction])
      await refreshTraderView()
      setSuccessMessage("Trader account opened.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Open account failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    clearMessages,
    derived.engine,
    derived.trader,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refreshTraderView,
    sendAndIndex,
    shardAddress,
    hasOnchainTraderAccount,
  ])

  const handleDeposit = useCallback(async (amountText?: string) => {
    clearMessages()
    if (!ownerAddress || !client || !shardAddress || !derived.engine || !derived.trader) return

    const amount = parseFixedDecimal(amountText ?? depositInput, 6)
    if (!amount || amount <= 0n) {
      setErrorMessage("Enter a valid collateral amount.")
      return
    }

    setIsSubmitting(true)
    try {
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
      const userAccount = await rpc
        .getAccountInfo(userCollateral, { encoding: "base64" })
        .send()
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
      const vaultAccount = await rpc
        .getAccountInfo(vaultCollateral, { encoding: "base64" })
        .send()
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

      await sendAndIndex(instructions)
      await refreshTraderView()
      setSuccessMessage("Collateral deposited.")
      setPositionAction(null)
      setPositionActionAmount("")
      setCollateralPreview(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Deposit failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    clearMessages,
    client,
    collateralMintAddress,
    depositInput,
    derived.engine,
    derived.trader,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refreshTraderView,
    sendAndIndex,
    shardAddress,
  ])

  const handleWithdraw = useCallback(async (amountText?: string) => {
    clearMessages()
    if (!ownerAddress || !shardAddress || !derived.engine || !derived.trader) return

    const amount = parseFixedDecimal(amountText ?? withdrawInput, 6)
    const maxRemovable = toBigInt(traderView?.account.removableCollateral) ?? 0n
    if (!amount || amount <= 0n) {
      setErrorMessage("Enter a valid collateral removal amount.")
      return
    }
    if (amount > maxRemovable) {
      setErrorMessage("Amount exceeds removable collateral.")
      return
    }

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
      const userAccount = await rpc
        .getAccountInfo(userCollateral, { encoding: "base64" })
        .send()
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
      const vaultAccount = await rpc
        .getAccountInfo(vaultCollateral, { encoding: "base64" })
        .send()
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
        getWithdrawInstruction({
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
      await sendAndIndex(instructions)
      await refreshTraderView()
      setSuccessMessage("Collateral removed.")
      setPositionAction(null)
      setPositionActionAmount("")
      setCollateralPreview(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Collateral removal failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    clearMessages,
    client,
    collateralMintAddress,
    derived.engine,
    derived.trader,
    marketAddress,
    oracleFeedAddress,
    ownerAddress,
    refreshTraderView,
    sendAndIndex,
    shardAddress,
    traderView?.account.removableCollateral,
    withdrawInput,
  ])

  const handleTrade = useCallback(async () => {
    clearMessages()
    if (
      !ownerAddress ||
      !shardAddress ||
      !derived.engine ||
      !derived.lpPool ||
      !derived.trader ||
      !hybridQuote
    )
      return

    if (desiredNotional < minOrderNotional) {
      setErrorMessage("Order notional is below the market minimum.")
      return
    }
    if (!isNotionalStepAligned) {
      setErrorMessage("Order notional does not match the market notional step.")
      return
    }

    setIsSubmitting(true)
    try {
      const quote = await (async () => {
        const delaysMs = [0, 400, 800, 1_200, 2_000, 3_000]
        for (let attempt = 0; attempt < delaysMs.length; attempt += 1) {
          if (delaysMs[attempt]) await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]))
          try {
            return await convexAction<HybridQuoteResult>("matcher:getHybridQuote", {
              market: marketAddress,
              shard: shardAddress,
              oracleFeed: oracleFeedAddress,
              desiredNotional: desiredNotional.toString(),
              side: tradeSide,
              owner: ownerAddress,
            })
          } catch (error) {
            const message = error instanceof Error ? error.message : "Quote refresh failed"
            if (!isOracleStalenessError(message) || attempt === delaysMs.length - 1) throw error
            const stalenessSlots = extractOracleStalenessSlots(message)
            setErrorMessage(
              stalenessSlots
                ? `Oracle is stale by ${stalenessSlots} slots; waiting for a fresh update…`
                : "Oracle is stale; waiting for a fresh update…",
            )
          }
        }
        throw new Error("Quote refresh failed")
      })()

      setHybridQuote(quote)

      const execPrice = BigInt(quote.execPrice)
      if (execPrice <= 0n || desiredNotional <= 0n) {
        setErrorMessage("Enter a valid notional amount.")
        return
      }

      const sizeQAbs = (desiredNotional * 1_000_000n) / execPrice
      if (sizeQAbs <= 0n) {
        setErrorMessage("Trade size rounded to zero.")
        return
      }

      const crankInstruction = getKeeperCrankInstruction({
        keeper: ownerAddress,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shard: shardAddress,
        engine: address(derived.engine),
        nowSlot: BigInt(quote.nowSlot),
        oraclePrice: BigInt(quote.oraclePrice),
        orderedCandidates: [],
        maxRevalidations: 0,
      })
      const baseInstruction = getExecuteTradeInstruction({
        owner: ownerAddress,
        matcher: resolvedMatcherAuthority,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shard: shardAddress,
        engine: address(derived.engine),
        lpPool: address(derived.lpPool),
        trader: address(derived.trader),
        execPrice,
        sizeQ: tradeSide === "long" ? sizeQAbs : -sizeQAbs,
      })
      const accounts = baseInstruction.accounts ?? []
      const instruction =
        resolvedMatcherAuthority === ownerAddress
          ? baseInstruction
          : {
              ...baseInstruction,
              accounts: accounts.map((account) => {
                if (account.address !== resolvedMatcherAuthority) return account
                return { ...account, signer: matcherSigner }
              }),
            }
      await sendAndIndex([crankInstruction, instruction])
      await refreshTraderView()
      setSuccessMessage("Trade executed.")
      setActiveTab("positions")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Trade failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    clearMessages,
    desiredNotional,
    derived.engine,
    derived.lpPool,
    derived.trader,
    hybridQuote,
    marketAddress,
    matcherSigner,
    oracleFeedAddress,
    ownerAddress,
    refreshTraderView,
    sendAndIndex,
    shardAddress,
    resolvedMatcherAuthority,
    tradeSide,
    minOrderNotional,
    isNotionalStepAligned,
  ])

  const handleClosePosition = useCallback(async () => {
    clearMessages()
    const position = traderView?.positions[0]
    if (
      !position ||
      !ownerAddress ||
      !shardAddress ||
      !derived.engine ||
      !derived.lpPool ||
      !derived.trader
    )
      return

    const sizeQAbs = absBigInt(BigInt(position.sizeQ))
    if (sizeQAbs <= 0n) return

    setIsSubmitting(true)
    try {
      const quote = await convexAction<HybridQuoteResult>("matcher:getHybridQuote", {
        market: marketAddress,
        shard: shardAddress,
        oracleFeed: oracleFeedAddress,
        sizeQ: sizeQAbs.toString(),
        side: position.side === "long" ? "short" : "long",
        owner: ownerAddress,
      })
      setHybridQuote(quote)
      const crankInstruction = getKeeperCrankInstruction({
        keeper: ownerAddress,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shard: shardAddress,
        engine: address(derived.engine),
        nowSlot: BigInt(quote.nowSlot),
        oraclePrice: BigInt(quote.oraclePrice),
        orderedCandidates: [],
        maxRevalidations: 0,
      })
      const baseInstruction = getExecuteTradeInstruction({
        owner: ownerAddress,
        matcher: resolvedMatcherAuthority,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        shard: shardAddress,
        engine: address(derived.engine),
        lpPool: address(derived.lpPool),
        trader: address(derived.trader),
        execPrice: BigInt(quote.execPrice),
        sizeQ: position.side === "long" ? -sizeQAbs : sizeQAbs,
      })
      const accounts = baseInstruction.accounts ?? []
      const instruction =
        resolvedMatcherAuthority === ownerAddress
          ? baseInstruction
          : {
              ...baseInstruction,
              accounts: accounts.map((account) => {
                if (account.address !== resolvedMatcherAuthority) return account
                return { ...account, signer: matcherSigner }
              }),
            }
      await sendAndIndex([crankInstruction, instruction])
      await refreshTraderView()
      setSuccessMessage("Position closed.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Close failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    clearMessages,
    derived.engine,
    derived.lpPool,
    derived.trader,
    marketAddress,
    matcherSigner,
    oracleFeedAddress,
    ownerAddress,
    refreshTraderView,
    sendAndIndex,
    shardAddress,
    resolvedMatcherAuthority,
    traderView?.positions,
  ])

  const hasShard = Boolean(props.shard)
  const hasTrader = Boolean(traderView?.trader) || hasOnchainTraderAccount
  const quoteExecPrice = toBigInt(hybridQuote?.execPrice) ?? 0n
  const quoteOraclePrice = toBigInt(hybridQuote?.oraclePrice) ?? 0n
  const quoteSpreadBps = getDiffBps(quoteExecPrice, quoteOraclePrice)
  const sizePreviewQ =
    quoteExecPrice > 0n && desiredNotional > 0n
      ? (desiredNotional * 1_000_000n) / quoteExecPrice
      : 0n
  const minInitialMargin = traderView
    ? (desiredNotional * BigInt(traderView.metadata.initialMarginBps)) / 10_000n
    : 0n
  const targetMargin =
    boundedLeverageX100 > 0
      ? (desiredNotional * 100n) / BigInt(boundedLeverageX100)
      : 0n
  const requiredMargin = targetMargin > minInitialMargin ? targetMargin : minInitialMargin
  const marginBufferBps = traderView?.metadata.removableCollateralBufferBps ?? 100
  const recommendedMargin =
    (requiredMargin * BigInt(10_000 + marginBufferBps)) / 10_000n
  const currentCollateral = toBigInt(traderView?.account.collateralBalance) ?? 0n
  const isBelowRequiredMargin = requiredMargin > currentCollateral
  const isBelowRecommendedMargin =
    !isBelowRequiredMargin && recommendedMargin > currentCollateral
  const canTrade =
    hasTrader &&
    Boolean(hybridQuote) &&
    !isBelowRequiredMargin &&
    isNotionalValid &&
    boundedLeverageX100 <= maxLeverageX100

  return (
    <div className="grid grid-cols-1 gap-4">
      {!hasShard ? (
        <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-black dark:text-zinc-200">
          This market has no indexed shard yet, so trading is not available.
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <MiniChartPlaceholder />

        <section className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                Compact trade ticket
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                Swap-simple entry with leverage and visible execution quality.
              </p>
            </div>
            {!hasTrader ? (
              <button
                type="button"
                onClick={handleOpenTrader}
                disabled={!ready || isSubmitting || !hasShard}
                className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 px-4 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-white/10 dark:text-zinc-50"
              >
                Open trader
              </button>
            ) : (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {traderView?.metadata.underlyingSymbol}/{traderView?.metadata.collateralSymbol}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(["long", "short"] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setTradeSide(side)}
                className={`inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium ${
                  tradeSide === side
                    ? side === "long"
                      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                      : "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200"
                    : "border border-black/10 text-zinc-700 dark:border-white/10 dark:text-zinc-200"
                }`}
              >
                {side === "long" ? "Buy / Long" : "Sell / Short"}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Notional ({traderView?.metadata.collateralSymbol ?? "USDC"})
              </div>
              <input
                value={notionalInput}
                onChange={(event) => setNotionalInput(event.target.value)}
                placeholder="1000"
                inputMode="decimal"
                className="mt-3 h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
              <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                Auto-quoted from LP-backed synthetic depth.
              </div>
            </div>

            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Target leverage</div>
              <input
                type="range"
                min="100"
                max={`${traderView?.metadata.maxLeverageX100 ?? 1000}`}
                step="25"
                value={selectedLeverageX100 || 100}
                onChange={(event) =>
                  setLeverageInput((Number(event.target.value) / 100).toString())
                }
                className="mt-3 w-full"
              />
              <div className="mt-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>1.00x</span>
                <span>{formatLeverageX100(boundedLeverageX100)}</span>
                <span>{formatLeverageX100(maxLeverageX100)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(traderView?.metadata.leveragePresetsX100 ?? [200, 300, 500, 1000]).map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setLeverageInput((preset / 100).toString())}
                      className="inline-flex h-8 items-center justify-center rounded-full border border-black/10 px-3 text-xs font-medium text-zinc-700 dark:border-white/10 dark:text-zinc-200"
                    >
                      {formatLeverageX100(preset)}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Derived size</div>
              <div className="mt-1 font-medium text-zinc-950 dark:text-zinc-50">
                {formatFixedDecimal(sizePreviewQ, 6)} {traderView?.metadata.underlyingSymbol ?? "SOL"}
              </div>
            </div>
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Required margin</div>
              <div className="mt-1 font-medium text-zinc-950 dark:text-zinc-50">
                {formatFixedDecimal(requiredMargin, 6)} {traderView?.metadata.collateralSymbol ?? "USDC"}
              </div>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Recommended {formatFixedDecimal(recommendedMargin, 6)} {traderView?.metadata.collateralSymbol ?? "USDC"}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-zinc-500 dark:text-zinc-400 md:grid-cols-2">
            <div>
              Minimum order {formatFixedDecimal(minOrderNotional, 6)}{" "}
              {traderView?.metadata.collateralSymbol ?? "USDC"}
            </div>
            <div>
              Step {formatFixedDecimal(notionalStep, 6)}{" "}
              {traderView?.metadata.collateralSymbol ?? "USDC"}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-black/10 p-4 text-sm dark:border-white/10">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Mark</div>
                <div className="mt-1 font-mono text-zinc-950 dark:text-zinc-50">
                  {isQuoteLoading ? "..." : formatFixedDecimal(quoteOraclePrice, 6)}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Exec</div>
                <div className="mt-1 font-mono text-zinc-950 dark:text-zinc-50">
                  {isQuoteLoading ? "..." : formatFixedDecimal(quoteExecPrice, 6)}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Spread</div>
                <div className="mt-1 font-mono text-zinc-950 dark:text-zinc-50">
                  {quoteSpreadBps.toString(10)} bps
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Fallback</div>
                <div className="mt-1 font-mono text-zinc-950 dark:text-zinc-50">
                  {hybridQuote?.usedFallback ? "yes" : "no"}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-zinc-600 dark:text-zinc-300 md:grid-cols-2">
              <div>
                Depth served {formatFixedDecimal(toBigInt(hybridQuote?.depthServedNotional) ?? 0n, 6)} USDC
              </div>
              <div>
                Fallback notional {formatFixedDecimal(toBigInt(hybridQuote?.fallbackNotional) ?? 0n, 6)} USDC
              </div>
            </div>
          </div>

          {isBelowRequiredMargin ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
              Add at least{" "}
              {formatFixedDecimal(requiredMargin - currentCollateral, 6)}{" "}
              {traderView?.metadata.collateralSymbol ?? "USDC"} before trading.
            </div>
          ) : null}

          {isBelowRecommendedMargin ? (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
              This trade meets the minimum margin requirement, but sits below the recommended buffer of{" "}
              {formatFixedDecimal(recommendedMargin, 6)}{" "}
              {traderView?.metadata.collateralSymbol ?? "USDC"}.
            </div>
          ) : null}

          {!isNotionalValid && desiredNotional > 0n ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
              Order notional must be at least{" "}
              {formatFixedDecimal(minOrderNotional, 6)} and align to the configured step.
            </div>
          ) : null}

          <div className="mt-4">
            <button
              type="button"
              onClick={handleTrade}
              disabled={!ready || isSubmitting || !canTrade}
              className={`inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-medium disabled:opacity-50 ${
                tradeSide === "long"
                  ? "bg-emerald-600 text-white"
                  : "bg-rose-600 text-white"
              }`}
            >
              {tradeSide === "long" ? "Open long" : "Open short"}
            </button>
          </div>
        </section>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start rounded-full bg-white p-1 dark:bg-white/5">
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="mt-4">
          <section className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
            <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
              Positions
            </h2>
            {traderView?.positions.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    <tr className="border-b border-black/10 dark:border-white/10">
                      <th className="px-3 py-3">Side</th>
                      <th className="px-3 py-3">Size</th>
                      <th className="px-3 py-3">Notional</th>
                      <th className="px-3 py-3">Avg entry</th>
                      <th className="px-3 py-3">Mark</th>
                      <th className="px-3 py-3">Unrealized</th>
                      <th className="px-3 py-3">Realized</th>
                      <th className="px-3 py-3">Leverage</th>
                      <th className="px-3 py-3">Margin</th>
                      <th className="px-3 py-3">Liq.</th>
                      <th className="px-3 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traderView.positions.map((position) => (
                      <Fragment key={`${position.side}-${position.sizeQ}`}>
                      <tr
                        className="border-b border-black/5 text-zinc-700 dark:border-white/5 dark:text-zinc-200"
                      >
                        <td className="px-3 py-4 font-medium capitalize">{position.side}</td>
                        <td className="px-3 py-4 font-mono">
                          {formatSignedFixedDecimal(BigInt(position.sizeQ), 6)}
                        </td>
                        <td className="px-3 py-4 font-mono">
                          {formatFixedDecimal(BigInt(position.notional), 6)}
                        </td>
                        <td className="px-3 py-4 font-mono">
                          {formatFixedDecimal(BigInt(position.averageEntryPrice), 6)}
                        </td>
                        <td className="px-3 py-4 font-mono">
                          {formatFixedDecimal(BigInt(position.markPrice), 6)}
                        </td>
                        <td className="px-3 py-4 font-mono">
                          {formatSignedFixedDecimal(BigInt(position.unrealizedPnl), 6)}
                        </td>
                        <td className="px-3 py-4 font-mono">
                          {formatSignedFixedDecimal(BigInt(position.realizedPnl), 6)}
                        </td>
                        <td className="px-3 py-4 font-mono">
                          {formatLeverageX100(position.leverageX100)}
                        </td>
                        <td className="px-3 py-4 font-mono">
                          {formatFixedDecimal(BigInt(position.allocatedCollateral), 6)}
                        </td>
                        <td className="px-3 py-4 font-mono">
                          {position.liquidationPrice
                            ? formatFixedDecimal(BigInt(position.liquidationPrice), 6)
                            : "N/A"}
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setPositionAction((current) =>
                                  current === "add" ? null : "add",
                                )
                                setPositionActionAmount(depositInput)
                                setCollateralPreview(null)
                              }}
                              className="inline-flex h-8 items-center justify-center rounded-full border border-black/10 px-3 text-xs font-medium dark:border-white/10"
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPositionAction((current) =>
                                  current === "remove" ? null : "remove",
                                )
                                setPositionActionAmount(withdrawInput)
                                setCollateralPreview(null)
                              }}
                              disabled={!position.canRemoveCollateral}
                              className="inline-flex h-8 items-center justify-center rounded-full border border-black/10 px-3 text-xs font-medium disabled:opacity-50 dark:border-white/10"
                            >
                              Remove
                            </button>
                            <button
                              type="button"
                              onClick={handleClosePosition}
                              disabled={!position.canClose || isSubmitting}
                              className="inline-flex h-8 items-center justify-center rounded-full bg-zinc-950 px-3 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
                            >
                              Close
                            </button>
                          </div>
                        </td>
                      </tr>
                    {positionAction ? (
                      <tr className="border-b border-black/5 dark:border-white/5">
                        <td colSpan={11} className="px-3 py-4">
                          <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                              <div>
                                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                                  {positionAction === "add"
                                    ? "Add isolated collateral"
                                    : "Remove isolated collateral"}
                                </div>
                                <div className="mt-3 flex items-center gap-3">
                                  <input
                                    value={positionActionAmount}
                                    onChange={(event) =>
                                      setPositionActionAmount(event.target.value)
                                    }
                                    placeholder={positionAction === "add" ? "50" : "10"}
                                    inputMode="decimal"
                                    className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      positionAction === "add"
                                        ? void handleDeposit(positionActionAmount)
                                        : void handleWithdraw(positionActionAmount)
                                    }
                                    disabled={!ready || isSubmitting || !hasTrader}
                                    className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPositionAction(null)
                                      setPositionActionAmount("")
                                      setCollateralPreview(null)
                                    }}
                                    className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 px-4 text-sm font-medium text-zinc-950 dark:border-white/10 dark:text-zinc-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>

                              {collateralPreview ? (
                                <div className="grid grid-cols-2 gap-3 text-xs text-zinc-600 dark:text-zinc-300">
                                  <div>
                                    Next collateral{" "}
                                    <span className="font-mono">
                                      {formatFixedDecimal(
                                        BigInt(collateralPreview.collateralBalance),
                                        6,
                                      )}
                                    </span>
                                  </div>
                                  <div>
                                    Next leverage{" "}
                                    <span className="font-mono">
                                      {formatLeverageX100(
                                        collateralPreview.effectiveLeverageX100,
                                      )}
                                    </span>
                                  </div>
                                  <div>
                                    Next equity{" "}
                                    <span className="font-mono">
                                      {formatFixedDecimal(
                                        BigInt(collateralPreview.equity),
                                        6,
                                      )}
                                    </span>
                                  </div>
                                  <div>
                                    Margin ratio{" "}
                                    <span className="font-mono">
                                      {(collateralPreview.marginRatioBps / 100).toFixed(2)}%
                                    </span>
                                  </div>
                                  <div>
                                    Available margin{" "}
                                    <span className="font-mono">
                                      {formatFixedDecimal(
                                        BigInt(collateralPreview.availableMargin),
                                        6,
                                      )}
                                    </span>
                                  </div>
                                  <div>
                                    Liq.{" "}
                                    <span className="font-mono">
                                      {collateralPreview.estimatedLiquidationPrice
                                        ? formatFixedDecimal(
                                            BigInt(
                                              collateralPreview.estimatedLiquidationPrice,
                                            ),
                                            6,
                                          )
                                        : "N/A"}
                                    </span>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-black/10 p-4 text-sm text-zinc-600 dark:border-white/10 dark:text-zinc-300">
                No open position yet.
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="account" className="mt-4">
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
              <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                Account overview
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Collateral</div>
                  <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                    {formatFixedDecimal(toBigInt(traderView?.account.collateralBalance) ?? 0n, 6)} USDC
                  </div>
                </div>
                <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Equity</div>
                  <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                    {formatFixedDecimal(toBigInt(traderView?.account.equity) ?? 0n, 6)} USDC
                  </div>
                </div>
                <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Used margin</div>
                  <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                    {formatFixedDecimal(toBigInt(traderView?.account.usedMargin) ?? 0n, 6)} USDC
                  </div>
                </div>
                <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Available margin</div>
                  <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                    {formatFixedDecimal(toBigInt(traderView?.account.availableMargin) ?? 0n, 6)} USDC
                  </div>
                </div>
                <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Effective leverage</div>
                  <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                    {formatLeverageX100(traderView?.account.effectiveLeverageX100 ?? 0)}
                  </div>
                </div>
                <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Risk tier</div>
                  <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                    {traderView?.account.riskTierLabel ?? "N/A"}
                  </div>
                </div>
                <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Removable collateral</div>
                  <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                    {formatFixedDecimal(toBigInt(traderView?.account.removableCollateral) ?? 0n, 6)} USDC
                  </div>
                </div>
                <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Margin ratio</div>
                  <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                    {((traderView?.account.marginRatioBps ?? 0) / 100).toFixed(2)}%
                  </div>
                </div>
                <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Estimated liq.</div>
                  <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                    {traderView?.account.estimatedLiquidationPrice
                      ? formatFixedDecimal(BigInt(traderView.account.estimatedLiquidationPrice), 6)
                      : "N/A"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
              <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                Funding
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                Use this only to fund the trader account before the first position. Live isolated-position margin changes happen in the Positions tab.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <input
                  value={depositInput}
                  onChange={(event) => setDepositInput(event.target.value)}
                  placeholder="100"
                  inputMode="decimal"
                  className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
                <button
                  type="button"
                  onClick={() => void handleDeposit()}
                  disabled={!ready || isSubmitting || !hasTrader}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 px-4 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-white/10 dark:text-zinc-50"
                >
                  Fund
                </button>
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <section className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
            <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
              Activity
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              {traderView?.activity.length ? (
                traderView.activity.map((event) => (
                  <div
                    key={`${event.type}-${event.signature}`}
                    className="rounded-xl border border-black/10 p-4 text-sm dark:border-white/10"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
                        {event.type}
                      </span>
                      <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                        {formatAddress(event.signature)}
                      </span>
                    </div>
                    {"sizeQ" in event ? (
                      <div className="mt-2 text-zinc-700 dark:text-zinc-200">
                        Size{" "}
                        <span className="font-mono">
                          {formatSignedFixedDecimal(BigInt(event.sizeQ), 6)}
                        </span>{" "}
                        at{" "}
                        <span className="font-mono">
                          {formatFixedDecimal(BigInt(event.execPrice), 6)}
                        </span>{" "}
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          spread {event.effectiveSpreadBps}bps, fallback{" "}
                          {event.usedFallback ? "yes" : "no"}
                        </span>
                      </div>
                    ) : "amount" in event ? (
                      <div className="mt-2 text-zinc-700 dark:text-zinc-200">
                        Amount{" "}
                        <span className="font-mono">
                          {formatFixedDecimal(BigInt(event.amount), 6)}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-2 text-zinc-700 dark:text-zinc-200">
                        Position liquidated: {event.liquidated ? "yes" : "no"}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-black/10 p-4 text-sm text-zinc-600 dark:border-white/10 dark:text-zinc-300">
                  No trader activity indexed for this wallet in the selected market yet.
                </div>
              )}
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  )
}

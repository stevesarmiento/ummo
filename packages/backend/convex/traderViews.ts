import { queryGeneric } from "convex/server"
import { v } from "convex/values"

import {
  computePositionRiskSnapshot,
  type PersistedPositionLike,
  type TradingConfigShape,
  type TradeLike,
} from "./lib/trader_position"

interface TradingConfigDoc extends TradingConfigShape {
  market: string
  defaultInputMode: "quote-notional" | "base-quantity"
  maxLeverageX100: number
  leveragePresetsX100: number[]
  minOrderNotional: bigint
  notionalStep: bigint
  quantityStepQ: bigint
  initialMarginBps: number
  maintenanceMarginBps: number
  removableCollateralBufferBps: number
  underlyingSymbol: string
  collateralSymbol: string
}

interface TraderDoc {
  trader: string
  owner: string
  market: string
  shard: string
  engineIndex: number
  collateralBalance: bigint
}

interface PositionDoc {
  trader: string
  owner: string
  market: string
  shard: string
  positionSizeQ: bigint
  averageEntryPrice?: bigint
  realizedPnl?: bigint
  lastExecPrice: bigint
  lastOraclePrice: bigint
  lastUpdatedSlot: bigint
}

interface TradeDoc {
  signature: string
  slot: bigint
  market: string
  shard: string
  trader: string
  owner: string
  sizeQ: bigint
  execPrice: bigint
  oraclePrice: bigint
  effectiveSpreadBps?: number
  usedFallback?: boolean
  fallbackNotional?: bigint
  nowSlot: bigint
  indexedAt: number
}

interface DepositDoc {
  signature: string
  slot: bigint
  market: string
  shard: string
  trader: string
  owner: string
  amount: bigint
  indexedAt: number
}

interface WithdrawalDoc {
  signature: string
  slot: bigint
  market: string
  shard: string
  trader: string
  owner: string
  amount: bigint
  indexedAt: number
}

interface LiquidationDoc {
  signature: string
  slot: bigint
  market: string
  shard: string
  liquidateeOwner: string
  liquidated: boolean
  indexedAt: number
}

interface FundingPaymentDoc {
  signature: string
  slot: bigint
  market: string
  shard: string
  owner: string
  deltaFundingPnl: bigint
  cumulativeFundingPnl: bigint
  nowSlot: bigint
  indexedAt: number
}

interface HousekeepingDoc {
  signature: string
  slot: bigint
  market: string
  shard: string
  kind: "accountClosed" | "traderClosed" | "accountReclaimed" | "dustGarbageCollected"
  trader?: string
  engineIndex?: number
  amountReturned?: bigint
  nowSlot: bigint
  indexedAt: number
}

function normalizeTradingConfig(
  market: string,
  config: TradingConfigDoc | null,
): TradingConfigDoc {
  if (config) return config

  return {
    market,
    defaultInputMode: "quote-notional",
    maxLeverageX100: 1_000,
    leveragePresetsX100: [200, 300, 500, 750, 1_000],
    minOrderNotional: 5_000_000n,
    notionalStep: 1_000_000n,
    quantityStepQ: 10_000n,
    initialMarginBps: 1_000,
    maintenanceMarginBps: 500,
    removableCollateralBufferBps: 100,
    underlyingSymbol: "SOL",
    collateralSymbol: "USDC",
  }
}

function mapActivity(args: {
  trades: TradeDoc[]
  deposits: DepositDoc[]
  withdrawals: WithdrawalDoc[]
  liquidations: LiquidationDoc[]
  fundingPayments: FundingPaymentDoc[]
  housekeeping: HousekeepingDoc[]
}) {
  const events = [
    ...args.trades.map((trade) => ({
      type: "TradeExecuted" as const,
      signature: trade.signature,
      slot: trade.slot.toString(10),
      indexedAt: trade.indexedAt,
      sizeQ: trade.sizeQ.toString(10),
      execPrice: trade.execPrice.toString(10),
      effectiveSpreadBps: trade.effectiveSpreadBps ?? 0,
      usedFallback: trade.usedFallback ?? false,
      fallbackNotional: trade.fallbackNotional?.toString(10) ?? "0",
    })),
    ...args.deposits.map((deposit) => ({
      type: "Deposit" as const,
      signature: deposit.signature,
      slot: deposit.slot.toString(10),
      indexedAt: deposit.indexedAt,
      amount: deposit.amount.toString(10),
    })),
    ...args.withdrawals.map((withdrawal) => ({
      type: "Withdrawal" as const,
      signature: withdrawal.signature,
      slot: withdrawal.slot.toString(10),
      indexedAt: withdrawal.indexedAt,
      amount: withdrawal.amount.toString(10),
    })),
    ...args.liquidations.map((liquidation) => ({
      type: "Liquidation" as const,
      signature: liquidation.signature,
      slot: liquidation.slot.toString(10),
      indexedAt: liquidation.indexedAt,
      liquidated: liquidation.liquidated,
    })),
    ...args.fundingPayments.map((payment) => ({
      type: "FundingPayment" as const,
      signature: payment.signature,
      slot: payment.slot.toString(10),
      indexedAt: payment.indexedAt,
      deltaFundingPnl: payment.deltaFundingPnl.toString(10),
      cumulativeFundingPnl: payment.cumulativeFundingPnl.toString(10),
    })),
    ...args.housekeeping.flatMap((h): any[] => {
      if (h.kind === "traderClosed")
        return [
          {
            type: "TraderClosed" as const,
            signature: h.signature,
            slot: h.slot.toString(10),
            indexedAt: h.indexedAt,
            amountReturned: (h.amountReturned ?? 0n).toString(10),
          },
        ]
      if (h.kind === "accountClosed")
        return [
          {
            type: "AccountClosed" as const,
            signature: h.signature,
            slot: h.slot.toString(10),
            indexedAt: h.indexedAt,
            engineIndex: h.engineIndex ?? 0,
            amountReturned: (h.amountReturned ?? 0n).toString(10),
          },
        ]
      return []
    }),
  ] as Array<{ slot: string; indexedAt: number } & Record<string, unknown>>

  events.sort((left, right) => {
    const slotDiff = Number(BigInt(right.slot) - BigInt(left.slot))
    if (slotDiff !== 0) return slotDiff
    return right.indexedAt - left.indexedAt
  })

  return events.slice(0, 25)
}

export const getByOwnerMarketShard = queryGeneric({
  args: {
    owner: v.string(),
    market: v.string(),
    shard: v.string(),
  },
  handler: async (ctx, args) => {
    const [
      configRow,
      traderRows,
      trades,
      deposits,
      withdrawals,
      liquidations,
      fundingPayments,
      housekeepingEvents,
      positionRows,
    ] =
      await Promise.all([
        ctx.db
          .query("marketTradingConfigs")
          .withIndex("by_market", (q) => q.eq("market", args.market))
          .unique(),
        ctx.db
          .query("traders")
          .withIndex("by_owner", (q) => q.eq("owner", args.owner))
          .collect() as Promise<TraderDoc[]>,
        ctx.db
          .query("trades")
          .withIndex("by_owner", (q) => q.eq("owner", args.owner))
          .collect() as Promise<TradeDoc[]>,
        ctx.db
          .query("deposits")
          .withIndex("by_owner", (q) => q.eq("owner", args.owner))
          .collect() as Promise<DepositDoc[]>,
        ctx.db
          .query("withdrawals")
          .withIndex("by_owner", (q) => q.eq("owner", args.owner))
          .collect() as Promise<WithdrawalDoc[]>,
        ctx.db
          .query("liquidations")
          .withIndex("by_owner", (q) => q.eq("liquidateeOwner", args.owner))
          .collect() as Promise<LiquidationDoc[]>,
        ctx.db
          .query("fundingPayments")
          .withIndex("by_owner", (q) => q.eq("owner", args.owner))
          .collect() as Promise<FundingPaymentDoc[]>,
        ctx.db
          .query("housekeepingEvents")
          .withIndex("by_owner", (q) => q.eq("owner", args.owner))
          .collect() as Promise<HousekeepingDoc[]>,
        ctx.db
          .query("positionsView")
          .withIndex("by_owner", (q) => q.eq("owner", args.owner))
          .collect() as Promise<PositionDoc[]>,
      ])

    const config = normalizeTradingConfig(args.market, configRow as TradingConfigDoc | null)
    const trader =
      traderRows.find(
        (row) => row.market === args.market && row.shard === args.shard,
      ) ?? null
    const filteredTrades = trades.filter(
      (trade) => trade.market === args.market && trade.shard === args.shard,
    )
    const filteredDeposits = deposits.filter(
      (deposit) => deposit.market === args.market && deposit.shard === args.shard,
    )
    const filteredWithdrawals = withdrawals.filter(
      (withdrawal) => withdrawal.market === args.market && withdrawal.shard === args.shard,
    )
    const filteredLiquidations = liquidations.filter(
      (liquidation) => liquidation.market === args.market && liquidation.shard === args.shard,
    )
    const filteredFundingPayments = fundingPayments.filter(
      (payment) => payment.market === args.market && payment.shard === args.shard,
    )
    const filteredHousekeeping = housekeepingEvents.filter(
      (event) => event.market === args.market && event.shard === args.shard,
    )
    const indexedPosition =
      positionRows.find(
        (position) => position.market === args.market && position.shard === args.shard,
      ) ?? null

    const markPrice =
      indexedPosition?.lastOraclePrice ??
      filteredTrades.sort((left, right) => right.indexedAt - left.indexedAt)[0]?.oraclePrice ??
      0n
    const collateralBalance = trader?.collateralBalance ?? 0n
    const positionState = computePositionRiskSnapshot({
      persistedPosition: indexedPosition as PersistedPositionLike | null,
      markPrice,
      collateralBalance,
      config,
      tradesFallback: filteredTrades as TradeLike[],
    })
    const tradeActivity = mapActivity({
      trades: filteredTrades,
      deposits: filteredDeposits,
      withdrawals: filteredWithdrawals,
      liquidations: filteredLiquidations,
      fundingPayments: filteredFundingPayments,
      housekeeping: filteredHousekeeping,
    })

    return {
      metadata: {
        defaultInputMode: config.defaultInputMode,
        maxLeverageX100: config.maxLeverageX100,
        leveragePresetsX100: config.leveragePresetsX100,
        minOrderNotional: config.minOrderNotional.toString(10),
        notionalStep: config.notionalStep.toString(10),
        quantityStepQ: config.quantityStepQ.toString(10),
        initialMarginBps: config.initialMarginBps,
        maintenanceMarginBps: config.maintenanceMarginBps,
        removableCollateralBufferBps: config.removableCollateralBufferBps,
        underlyingSymbol: config.underlyingSymbol,
        collateralSymbol: config.collateralSymbol,
      },
      trader: trader
        ? {
            trader: trader.trader,
            engineIndex: trader.engineIndex,
            collateralBalance: trader.collateralBalance.toString(10),
          }
        : null,
      account: {
        collateralBalance: positionState.allocatedCollateral.toString(10),
        usedMargin: positionState.usedMargin.toString(10),
        availableMargin: positionState.availableMargin.toString(10),
        equity: positionState.equity.toString(10),
        effectiveLeverageX100: positionState.effectiveLeverageX100,
        removableCollateral: positionState.removableCollateral.toString(10),
        initialMarginRequirement:
          positionState.initialMarginRequirement.toString(10),
        maintenanceMargin: positionState.maintenanceMargin.toString(10),
        estimatedLiquidationPrice:
          positionState.liquidationPrice?.toString(10) ?? null,
        marginRatioBps: positionState.marginRatioBps,
        riskTierLabel: `Up to ${(config.maxLeverageX100 / 100).toFixed(2)}x`,
      },
      positions:
        positionState.side === "flat"
          ? []
          : [
              {
                side: positionState.side,
                sizeQ: positionState.sizeQ.toString(10),
                notional: positionState.notional.toString(10),
                averageEntryPrice: positionState.averageEntryPrice.toString(10),
                markPrice: positionState.markPrice.toString(10),
                unrealizedPnl: positionState.unrealizedPnl.toString(10),
                realizedPnl: positionState.realizedPnl.toString(10),
                leverageX100: positionState.effectiveLeverageX100,
                allocatedCollateral: positionState.allocatedCollateral.toString(10),
                liquidationPrice:
                  positionState.liquidationPrice?.toString(10) ?? null,
                removableCollateral:
                  positionState.removableCollateral.toString(10),
                canAddCollateral: true,
                canRemoveCollateral: positionState.removableCollateral > 0n,
                canClose: true,
              },
            ],
      activity: tradeActivity,
    }
  },
})

export const previewCollateralChange = queryGeneric({
  args: {
    owner: v.string(),
    market: v.string(),
    shard: v.string(),
    deltaCollateral: v.int64(),
  },
  handler: async (ctx, args) => {
    const [configRow, traderRows, positionRows, trades] = await Promise.all([
      ctx.db
        .query("marketTradingConfigs")
        .withIndex("by_market", (q) => q.eq("market", args.market))
        .unique(),
      ctx.db
        .query("traders")
        .withIndex("by_owner", (q) => q.eq("owner", args.owner))
        .collect() as Promise<TraderDoc[]>,
      ctx.db
        .query("positionsView")
        .withIndex("by_owner", (q) => q.eq("owner", args.owner))
        .collect() as Promise<PositionDoc[]>,
      ctx.db
        .query("trades")
        .withIndex("by_owner", (q) => q.eq("owner", args.owner))
        .collect() as Promise<TradeDoc[]>,
    ])

    const config = normalizeTradingConfig(args.market, configRow as TradingConfigDoc | null)
    const trader =
      traderRows.find(
        (row) => row.market === args.market && row.shard === args.shard,
      ) ?? null
    const position =
      positionRows.find(
        (row) => row.market === args.market && row.shard === args.shard,
      ) ?? null
    const filteredTrades = trades.filter(
      (trade) => trade.market === args.market && trade.shard === args.shard,
    )
    const markPrice =
      position?.lastOraclePrice ??
      filteredTrades.sort((left, right) => right.indexedAt - left.indexedAt)[0]?.oraclePrice ??
      0n
    const snapshot = computePositionRiskSnapshot({
      persistedPosition: position
        ? {
            positionSizeQ: position.positionSizeQ,
            averageEntryPrice: position.averageEntryPrice ?? 0n,
            realizedPnl: position.realizedPnl ?? 0n,
          }
        : {
            positionSizeQ: 0n,
            averageEntryPrice: 0n,
            realizedPnl: 0n,
          },
      markPrice,
      collateralBalance: (trader?.collateralBalance ?? 0n) + args.deltaCollateral,
      config,
      tradesFallback: filteredTrades as TradeLike[],
    })

    return {
      collateralBalance: snapshot.allocatedCollateral.toString(10),
      effectiveLeverageX100: snapshot.effectiveLeverageX100,
      removableCollateral: snapshot.removableCollateral.toString(10),
      equity: snapshot.equity.toString(10),
      availableMargin: snapshot.availableMargin.toString(10),
      estimatedLiquidationPrice: snapshot.liquidationPrice?.toString(10) ?? null,
      marginRatioBps: snapshot.marginRatioBps,
    }
  },
})

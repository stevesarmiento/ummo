import { queryGeneric } from "convex/server"
import { v } from "convex/values"

interface MarketRow {
  market: string
  marketId: bigint
  authority: string
  oracleFeed: string
  matcherAuthority: string
  createdAtSlot: bigint
  indexedAt: number
}

interface ShardRow {
  shard: string
  market: string
  shardSeed: string
  shardId: number
  lastCrankSlot: bigint
  indexedAt: number
}

interface LiquidationRow {
  market: string
  shard: string
  liquidated: boolean
  indexedAt: number
}

interface TradeRow {
  market: string
  shard: string
  indexedAt: number
}

interface QuoteAnalyticsRow {
  market: string
  shard: string
  fallbackNotional: bigint
  requestedNotional: bigint
  usedFallback: boolean
  indexedAt: number
}

export interface Snapshot {
  markets: MarketRow[]
  shards: ShardRow[]
  liquidations: LiquidationRow[]
  trades: TradeRow[]
  quoteAnalytics: QuoteAnalyticsRow[]
}

export const getSnapshot = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const [markets, shards, liquidations, trades, quoteAnalytics] = await Promise.all([
      ctx.db.query("markets").collect() as Promise<MarketRow[]>,
      ctx.db.query("shards").collect() as Promise<ShardRow[]>,
      ctx.db.query("liquidations").collect() as Promise<LiquidationRow[]>,
      ctx.db.query("trades").collect() as Promise<TradeRow[]>,
      ctx.db.query("quoteAnalytics").collect() as Promise<QuoteAnalyticsRow[]>,
    ])

    return { markets, shards, liquidations, trades, quoteAnalytics }
  },
})


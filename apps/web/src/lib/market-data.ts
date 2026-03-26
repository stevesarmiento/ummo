import { convexQuery } from "./convex-http"

export interface MarketDoc {
  market: string
  authority: string
  collateralMint: string
  oracleFeed: string
  matcherAuthority: string
  marketId: unknown
}

export interface ShardDoc {
  shard: string
  market: string
  shardSeed: string
  shardId: number
  houseEngineIndex: number
  lastCrankSlot: unknown
}

export interface MarketSummary {
  market: string
  marketId: string
  authority: string
  collateralMint: string
  oracleFeed: string
  matcherAuthority: string
  shardCount: number
  poolCount: number
  tradeable: boolean
  totalPoolNav: string
  totalDeposited: string
  totalShares: string
  configuredDepthNotional: string
  lpPnlEstimate: string
  protocolFeeAccrued: string
  lpOwnerCount: number
  configuredBandOwnerCount: number
  traderCount: number
  tradeCount24h: number
  tradedNotional24h: string
  hasFreshShard: boolean
  lastCrankSlot: string | null
  yourLpShares: string
  yourLpValue: string
  yourTraderCount: number
  yourPositionSizeQ: string
}

export interface MarketDetail {
  doc: MarketDoc
  shards: ShardDoc[]
  selectedShard: ShardDoc | null
}

export interface MarketQuoteStats {
  quotes24h: number
  fallbackQuotes24h: number
  totalRequestedNotional: string
  totalFallbackNotional: string
  fallbackRateBps: number
}

export async function getMarketDetail(args: {
  market: string
  requestedShard?: string
}): Promise<MarketDetail | null> {
  const doc = await convexQuery<MarketDoc | null>("markets:getByMarket", {
    market: args.market,
  })
  if (!doc) return null

  const shards = await convexQuery<ShardDoc[]>("shards:listByMarket", {
    market: args.market,
  })
  const selectedShard =
    (args.requestedShard
      ? shards.find((shard) => shard.shard === args.requestedShard)
      : null) ??
    shards[0] ??
    null

  return {
    doc,
    shards,
    selectedShard,
  }
}

export async function listLpMarketSummaries(): Promise<MarketSummary[]> {
  return await convexQuery<MarketSummary[]>("marketViews:listLpMarkets", {})
}

export async function listTradeMarketSummaries(): Promise<MarketSummary[]> {
  return await convexQuery<MarketSummary[]>("marketViews:listTradeMarkets", {})
}

export async function getLpMarketSummary(market: string): Promise<MarketSummary | null> {
  return await convexQuery<MarketSummary | null>("marketViews:getLpMarketSummary", {
    market,
  })
}

export async function getTradeMarketSummary(
  market: string,
): Promise<MarketSummary | null> {
  return await convexQuery<MarketSummary | null>("marketViews:getTradeMarketSummary", {
    market,
  })
}

export async function getMarketQuoteStats(
  market: string,
): Promise<MarketQuoteStats> {
  return await convexQuery<MarketQuoteStats>("quoteAnalytics:getMarketStats", {
    market,
  })
}

import { queryGeneric } from "convex/server"
import { v } from "convex/values"

const DAY_MS = 24 * 60 * 60 * 1000

interface MarketRow {
  market: string
  authority: string
  collateralMint: string
  oracleFeed: string
  matcherAuthority: string
  marketId: bigint
  createdAtSlot: bigint
  indexedAt: number
}

interface ShardRow {
  shard: string
  market: string
  shardId: number
  lastCrankSlot: bigint
}

interface LpPoolRow {
  lpPool: string
  market: string
  shard: string
  pooledEngineIndex: number
  lpFeeBps: number
  protocolFeeBps: number
  totalShares: bigint
  accountingNav: bigint
  totalDeposited: bigint
  protocolFeeAccrued: bigint
}

interface LpPositionRow {
  lpPool: string
  market: string
  shard: string
  owner: string
  lpPosition: string
  shares: bigint
  lockedShares?: bigint
}

interface LpBandRow {
  lpPool: string
  market: string
  shard: string
  owner: string
  firstBandMaxNotional: bigint
  firstBandMaxInventoryBps: number
  secondBandMaxNotional: bigint
  secondBandMaxInventoryBps: number
  thirdBandMaxNotional: bigint
  thirdBandMaxInventoryBps: number
}

interface TraderRow {
  market: string
  shard: string
  trader: string
  owner: string
}

interface TradeRow {
  market: string
  shard: string
  owner: string
  sizeQ: bigint
  execPrice: bigint
  indexedAt: number
}

interface PositionRow {
  market: string
  owner: string
  positionSizeQ: bigint
}

interface MarketSummary {
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

function normalizeBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value
  if (typeof value === "number") return BigInt(value)
  if (typeof value === "string") return BigInt(value)
  return 0n
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right
}

function getActiveShares(position: LpPositionRow): bigint {
  const shares = normalizeBigInt(position.shares)
  const lockedShares = normalizeBigInt(position.lockedShares)
  const activeShares = shares - lockedShares
  return activeShares > 0n ? activeShares : 0n
}

function estimateConfiguredDepth(args: {
  pool: LpPoolRow
  positions: LpPositionRow[]
  bands: LpBandRow[]
}): bigint {
  const totalShares = normalizeBigInt(args.pool.totalShares)
  const accountingNav = normalizeBigInt(args.pool.accountingNav)
  if (totalShares <= 0n || accountingNav <= 0n) return 0n

  const positionsByOwner = new Map<string, bigint>()
  for (const position of args.positions) {
    positionsByOwner.set(position.owner, getActiveShares(position))
  }

  let totalDepth = 0n
  for (const band of args.bands) {
    const ownerShares = positionsByOwner.get(band.owner) ?? 0n
    if (ownerShares <= 0n) continue
    const ownerNav = (accountingNav * ownerShares) / totalShares
    const levels = [
      {
        maxNotional: normalizeBigInt(band.firstBandMaxNotional),
        maxInventoryBps: band.firstBandMaxInventoryBps,
      },
      {
        maxNotional: normalizeBigInt(band.secondBandMaxNotional),
        maxInventoryBps: band.secondBandMaxInventoryBps,
      },
      {
        maxNotional: normalizeBigInt(band.thirdBandMaxNotional),
        maxInventoryBps: band.thirdBandMaxInventoryBps,
      },
    ]

    for (const level of levels) {
      const inventoryCap = (ownerNav * BigInt(level.maxInventoryBps)) / 10_000n
      totalDepth += minBigInt(level.maxNotional, inventoryCap)
    }
  }

  return totalDepth
}

function getWindowTrades(trades: TradeRow[], market: string): TradeRow[] {
  const threshold = Date.now() - DAY_MS
  return trades.filter((trade) => trade.market === market && trade.indexedAt >= threshold)
}

function buildMarketSummary(args: {
  market: MarketRow
  shards: ShardRow[]
  lpPools: LpPoolRow[]
  lpPositions: LpPositionRow[]
  lpBands: LpBandRow[]
  traders: TraderRow[]
  trades: TradeRow[]
  positions: PositionRow[]
  owner?: string
}): MarketSummary {
  const totalPoolNav = args.lpPools.reduce(
    (sum, pool) => sum + normalizeBigInt(pool.accountingNav),
    0n,
  )
  const totalDeposited = args.lpPools.reduce(
    (sum, pool) => sum + normalizeBigInt(pool.totalDeposited),
    0n,
  )
  const totalShares = args.lpPools.reduce(
    (sum, pool) => sum + normalizeBigInt(pool.totalShares),
    0n,
  )
  const configuredDepthNotional = args.lpPools.reduce((sum, pool) => {
    const poolPositions = args.lpPositions.filter((position) => position.lpPool === pool.lpPool)
    const poolBands = args.lpBands.filter((band) => band.lpPool === pool.lpPool)
    return sum + estimateConfiguredDepth({ pool, positions: poolPositions, bands: poolBands })
  }, 0n)
  const protocolFeeAccrued = args.lpPools.reduce(
    (sum, pool) => sum + normalizeBigInt(pool.protocolFeeAccrued),
    0n,
  )
  const lpPnlEstimate = totalPoolNav - totalDeposited
  const uniqueLpOwners = new Set(args.lpPositions.map((position) => position.owner))
  const uniqueBandOwners = new Set(args.lpBands.map((band) => band.owner))
  const uniqueTraders = new Set(args.traders.map((trader) => trader.trader))
  const marketTrades24h = getWindowTrades(args.trades, args.market.market)
  const tradedNotional24h = marketTrades24h.reduce((sum, trade) => {
    const size = normalizeBigInt(trade.sizeQ)
    const execPrice = normalizeBigInt(trade.execPrice)
    const notional = (size < 0n ? -size : size) * execPrice / 1_000_000n
    return sum + notional
  }, 0n)
  const hasFreshShard = args.shards.some((shard) => normalizeBigInt(shard.lastCrankSlot) > 0n)
  const lastCrankSlot = args.shards.reduce<bigint | null>((latest, shard) => {
    const value = normalizeBigInt(shard.lastCrankSlot)
    if (latest == null || value > latest) return value
    return latest
  }, null)

  let yourLpShares = 0n
  let yourLpValue = 0n
  let yourTraderCount = 0
  let yourPositionSizeQ = 0n
  if (args.owner) {
    for (const pool of args.lpPools) {
      const position = args.lpPositions.find(
        (row) => row.lpPool === pool.lpPool && row.owner === args.owner,
      )
      if (!position) continue
      const shares = normalizeBigInt(position.shares)
      yourLpShares += shares
      const poolTotalShares = normalizeBigInt(pool.totalShares)
      if (poolTotalShares > 0n) {
        yourLpValue += (normalizeBigInt(pool.accountingNav) * shares) / poolTotalShares
      }
    }

    yourTraderCount = args.traders.filter((trader) => trader.owner === args.owner).length
    yourPositionSizeQ = args.positions
      .filter((position) => position.owner === args.owner)
      .reduce((sum, position) => sum + normalizeBigInt(position.positionSizeQ), 0n)
  }

  return {
    market: args.market.market,
    marketId: normalizeBigInt(args.market.marketId).toString(10),
    authority: args.market.authority,
    collateralMint: args.market.collateralMint,
    oracleFeed: args.market.oracleFeed,
    matcherAuthority: args.market.matcherAuthority,
    shardCount: args.shards.length,
    poolCount: args.lpPools.length,
    tradeable: args.shards.length > 0 && args.lpPools.length > 0,
    totalPoolNav: totalPoolNav.toString(10),
    totalDeposited: totalDeposited.toString(10),
    totalShares: totalShares.toString(10),
    configuredDepthNotional: configuredDepthNotional.toString(10),
    lpPnlEstimate: lpPnlEstimate.toString(10),
    protocolFeeAccrued: protocolFeeAccrued.toString(10),
    lpOwnerCount: uniqueLpOwners.size,
    configuredBandOwnerCount: uniqueBandOwners.size,
    traderCount: uniqueTraders.size,
    tradeCount24h: marketTrades24h.length,
    tradedNotional24h: tradedNotional24h.toString(10),
    hasFreshShard,
    lastCrankSlot: lastCrankSlot?.toString(10) ?? null,
    yourLpShares: yourLpShares.toString(10),
    yourLpValue: yourLpValue.toString(10),
    yourTraderCount,
    yourPositionSizeQ: yourPositionSizeQ.toString(10),
  }
}

async function loadSharedMarketData(ctx: {
  db: {
    query: (table: string) => {
      collect: () => Promise<unknown[]>
    }
  }
}) {
  const [markets, shards, lpPools, lpPositions, lpBands, traders, trades, positions] =
    await Promise.all([
      ctx.db.query("markets").collect(),
      ctx.db.query("shards").collect(),
      ctx.db.query("lpPools").collect(),
      ctx.db.query("lpPositions").collect(),
      ctx.db.query("lpBandConfigs").collect(),
      ctx.db.query("traders").collect(),
      ctx.db.query("trades").collect(),
      ctx.db.query("positionsView").collect(),
    ])

  return {
    markets: markets as MarketRow[],
    shards: shards as ShardRow[],
    lpPools: lpPools as LpPoolRow[],
    lpPositions: lpPositions as LpPositionRow[],
    lpBands: lpBands as LpBandRow[],
    traders: traders as TraderRow[],
    trades: trades as TradeRow[],
    positions: positions as PositionRow[],
  }
}

export const listLpMarkets = queryGeneric({
  args: {
    owner: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const shared = await loadSharedMarketData(ctx)
    const summaries = shared.markets.map((market) =>
      buildMarketSummary({
        market,
        shards: shared.shards.filter((row) => row.market === market.market),
        lpPools: shared.lpPools.filter((row) => row.market === market.market),
        lpPositions: shared.lpPositions.filter((row) => row.market === market.market),
        lpBands: shared.lpBands.filter((row) => row.market === market.market),
        traders: shared.traders.filter((row) => row.market === market.market),
        trades: shared.trades,
        positions: shared.positions.filter((row) => row.market === market.market),
        owner: args.owner,
      }),
    )

    summaries.sort((left, right) => Number(BigInt(left.marketId) - BigInt(right.marketId)))
    return summaries
  },
})

export const listTradeMarkets = queryGeneric({
  args: {
    owner: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const shared = await loadSharedMarketData(ctx)
    const summaries = shared.markets.map((market) =>
      buildMarketSummary({
        market,
        shards: shared.shards.filter((row) => row.market === market.market),
        lpPools: shared.lpPools.filter((row) => row.market === market.market),
        lpPositions: shared.lpPositions.filter((row) => row.market === market.market),
        lpBands: shared.lpBands.filter((row) => row.market === market.market),
        traders: shared.traders.filter((row) => row.market === market.market),
        trades: shared.trades,
        positions: shared.positions.filter((row) => row.market === market.market),
        owner: args.owner,
      }),
    )

    summaries.sort((left, right) => {
      if (left.tradeable !== right.tradeable) return left.tradeable ? -1 : 1
      return Number(BigInt(left.marketId) - BigInt(right.marketId))
    })
    return summaries
  },
})

export const getLpMarketSummary = queryGeneric({
  args: {
    market: v.string(),
    owner: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const shared = await loadSharedMarketData(ctx)
    const market = shared.markets.find((row) => row.market === args.market) ?? null
    if (!market) return null
    return buildMarketSummary({
      market,
      shards: shared.shards.filter((row) => row.market === market.market),
      lpPools: shared.lpPools.filter((row) => row.market === market.market),
      lpPositions: shared.lpPositions.filter((row) => row.market === market.market),
      lpBands: shared.lpBands.filter((row) => row.market === market.market),
      traders: shared.traders.filter((row) => row.market === market.market),
      trades: shared.trades,
      positions: shared.positions.filter((row) => row.market === market.market),
      owner: args.owner,
    })
  },
})

export const getTradeMarketSummary = queryGeneric({
  args: {
    market: v.string(),
    owner: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const shared = await loadSharedMarketData(ctx)
    const market = shared.markets.find((row) => row.market === args.market) ?? null
    if (!market) return null
    return buildMarketSummary({
      market,
      shards: shared.shards.filter((row) => row.market === market.market),
      lpPools: shared.lpPools.filter((row) => row.market === market.market),
      lpPositions: shared.lpPositions.filter((row) => row.market === market.market),
      lpBands: shared.lpBands.filter((row) => row.market === market.market),
      traders: shared.traders.filter((row) => row.market === market.market),
      trades: shared.trades,
      positions: shared.positions.filter((row) => row.market === market.market),
      owner: args.owner,
    })
  },
})

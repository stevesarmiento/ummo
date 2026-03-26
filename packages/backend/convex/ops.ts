import { actionGeneric, makeFunctionReference, queryGeneric } from "convex/server"
import { v } from "convex/values"

const MAX_CRANK_STALENESS_SLOTS = 100_000_000n

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

interface MatcherErrorRow {
  kind: string
  message: string
  signer?: string
  oracleFeed?: string
  rpcUrl?: string
  indexedAt: number
}

interface Snapshot {
  markets: MarketRow[]
  shards: ShardRow[]
  liquidations: LiquidationRow[]
  trades: TradeRow[]
  quoteAnalytics: QuoteAnalyticsRow[]
}

const getSnapshotRef = makeFunctionReference<"query">("ops:getSnapshot")
const listRecentMatcherErrors = makeFunctionReference<"query">(
  "matcherErrors:listRecent",
)

async function rpcCall<T>(args: {
  rpcUrl: string
  method: string
  params?: unknown[]
}): Promise<T> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: args.method,
    params: args.params ?? [],
  }

  const res = await fetch(args.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`RPC ${args.method} failed (${res.status})`)

  const json = (await res.json()) as { result?: T; error?: unknown }
  if (!("result" in json)) throw new Error(`RPC ${args.method} missing result`)
  return json.result as T
}

async function getNowSlot(rpcUrl: string): Promise<bigint> {
  const slot = await rpcCall<number>({ rpcUrl, method: "getSlot" })
  return BigInt(slot)
}

export const getRecentMatcherErrors = queryGeneric({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = (await ctx.db.query("matcherErrors").collect()) as MatcherErrorRow[]
    rows.sort((a, b) => b.indexedAt - a.indexedAt)
    return rows.slice(0, args.limit ?? 25)
  },
})

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

export const getDashboard = actionGeneric({
  args: { rpcUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const rpcUrl =
      args.rpcUrl ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com"

    const nowSlot = await getNowSlot(rpcUrl)
    const nowMs = Date.now()
    const since24hMs = nowMs - 24 * 60 * 60 * 1000

    const [snapshot, matcherErrors] = await Promise.all([
      ctx.runQuery(getSnapshotRef, {}) as Promise<Snapshot>,
      ctx.runQuery(listRecentMatcherErrors, { limit: 25 }) as Promise<
        MatcherErrorRow[]
      >,
    ])

    const { markets, shards, liquidations, trades, quoteAnalytics } = snapshot

    const liqCountsByShard = new Map<string, number>()
    for (const l of liquidations) {
      if (l.indexedAt < since24hMs) continue
      if (!l.liquidated) continue
      const key = `${l.market}:${l.shard}`
      liqCountsByShard.set(key, (liqCountsByShard.get(key) ?? 0) + 1)
    }

    const tradeCountsByShard = new Map<string, number>()
    for (const t of trades) {
      if (t.indexedAt < since24hMs) continue
      const key = `${t.market}:${t.shard}`
      tradeCountsByShard.set(key, (tradeCountsByShard.get(key) ?? 0) + 1)
    }

    let quotes24h = 0
    let fallbackQuotes24h = 0
    let requestedNotional24h = 0n
    let fallbackNotional24h = 0n
    for (const quote of quoteAnalytics) {
      if (quote.indexedAt < since24hMs) continue
      quotes24h += 1
      requestedNotional24h += quote.requestedNotional
      fallbackNotional24h += quote.fallbackNotional
      if (quote.usedFallback) fallbackQuotes24h += 1
    }

    const shardRows = shards
      .map((s) => {
        const lastCrankSlot = BigInt(s.lastCrankSlot)
        const stalenessSlots = nowSlot - lastCrankSlot
        const isStale = stalenessSlots < 0n || stalenessSlots > MAX_CRANK_STALENESS_SLOTS
        const key = `${s.market}:${s.shard}`

        return {
          market: s.market,
          shard: s.shard,
          shardId: s.shardId,
          shardSeed: s.shardSeed,
          lastCrankSlot: lastCrankSlot.toString(10),
          stalenessSlots: stalenessSlots < 0n ? "0" : stalenessSlots.toString(10),
          isStale,
          liquidations24h: liqCountsByShard.get(key) ?? 0,
          trades24h: tradeCountsByShard.get(key) ?? 0,
          indexedAt: s.indexedAt,
        }
      })
      .sort((a, b) => (a.market + a.shard).localeCompare(b.market + b.shard))

    markets.sort((a, b) => Number(a.marketId - b.marketId))

    return {
      rpcUrl,
      nowSlot: nowSlot.toString(10),
      maxCrankStalenessSlots: MAX_CRANK_STALENESS_SLOTS.toString(10),
      quoteAnalytics: {
        quotes24h,
        fallbackQuotes24h,
        requestedNotional24h: requestedNotional24h.toString(10),
        fallbackNotional24h: fallbackNotional24h.toString(10),
        fallbackRateBps:
          requestedNotional24h > 0n
            ? Number((fallbackNotional24h * 10_000n) / requestedNotional24h)
            : 0,
      },
      markets: markets.map((m) => ({
        market: m.market,
        marketId: m.marketId.toString(10),
        authority: m.authority,
        oracleFeed: m.oracleFeed,
        matcherAuthority: m.matcherAuthority,
        createdAtSlot: m.createdAtSlot.toString(10),
        indexedAt: m.indexedAt,
      })),
      shards: shardRows,
      matcherErrors: matcherErrors.map((e) => ({
        kind: e.kind,
        message: e.message,
        signer: e.signer ?? null,
        oracleFeed: e.oracleFeed ?? null,
        rpcUrl: e.rpcUrl ?? null,
        indexedAt: e.indexedAt,
      })),
    }
  },
})

const getTraderViewByOwnerMarketShard = makeFunctionReference<"query">(
  "traderViews:getByOwnerMarketShard",
)
const getActivityByOwnerMarketShard = makeFunctionReference<"query">(
  "activity:getByOwnerMarketShard",
)

export const debugGetDocById = queryGeneric({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id as never)
    return { id: args.id, doc }
  },
})

export const debugGetTraderBundleById = queryGeneric({
  args: { id: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const doc = (await ctx.db.get(args.id as never)) as
      | null
      | {
          owner?: unknown
          market?: unknown
          shard?: unknown
          trader?: unknown
        }

    if (!doc) return { id: args.id, found: false as const }

    const owner = typeof doc.owner === "string" ? doc.owner : null
    const market = typeof doc.market === "string" ? doc.market : null
    const shard = typeof doc.shard === "string" ? doc.shard : null

    if (!owner || !market || !shard) {
      return {
        id: args.id,
        found: true as const,
        doc,
        bundle: null,
        reason: "Document is not a trader-shaped row (missing owner/market/shard).",
      }
    }

    const [traderView, activity] = await Promise.all([
      ctx.runQuery(getTraderViewByOwnerMarketShard, { owner, market, shard }),
      ctx.runQuery(getActivityByOwnerMarketShard, {
        owner,
        market,
        shard,
        limit: args.limit ?? 50,
      }),
    ])

    return {
      id: args.id,
      found: true as const,
      doc,
      bundle: { owner, market, shard, traderView, activity },
    }
  },
})


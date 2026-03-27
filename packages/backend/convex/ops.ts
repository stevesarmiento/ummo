"use node"

import { actionGeneric, makeFunctionReference } from "convex/server"
import { v } from "convex/values"

import { getOraclePrice1e6FromPriceUpdateV2Bytes } from "./lib/pyth_receiver"
import { decodeBase64 } from "./lib/quasar_events"

const MAX_CRANK_STALENESS_SLOTS = 150n
const MAX_ORACLE_STALENESS_SLOTS = 10_000n
const MAX_ORACLE_CONFIDENCE_BPS = 200n

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

const getSnapshotRef = makeFunctionReference<"query">("opsSnapshot:getSnapshot")
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

async function getAccountDataBase64(rpcUrl: string, address: string): Promise<string> {
  const result = await rpcCall<{
    value: { data: [string, string] } | null
  }>({
    rpcUrl,
    method: "getAccountInfo",
    params: [address, { encoding: "base64" }],
  })

  const value = result.value
  if (!value) throw new Error("Account not found")

  const data = value.data
  const base64 = data[0]
  if (!base64) throw new Error("Account had empty data")
  return base64
}

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

    const oracleByFeed = new Map<
      string,
      | {
          ok: true
          price: bigint
          conf: bigint
          postedSlot: bigint
          stalenessSlots: bigint
          maxConf: bigint
          isStale: boolean
          isConfTooWide: boolean
        }
      | { ok: false; error: string }
    >()

    async function getOracleHealth(oracleFeed: string) {
      const existing = oracleByFeed.get(oracleFeed)
      if (existing) return existing

      try {
        const base64 = await getAccountDataBase64(rpcUrl, oracleFeed)
        const bytes = decodeBase64(base64)
        const parsed = getOraclePrice1e6FromPriceUpdateV2Bytes(bytes)
        if (!parsed) throw new Error("Invalid PriceUpdateV2 account data")

        const stalenessSlots = nowSlot - parsed.postedSlot
        const isStale =
          stalenessSlots < 0n || stalenessSlots > MAX_ORACLE_STALENESS_SLOTS
        const maxConf = (parsed.price * MAX_ORACLE_CONFIDENCE_BPS) / 10_000n
        const isConfTooWide = parsed.conf > maxConf

        const out = {
          ok: true as const,
          price: parsed.price,
          conf: parsed.conf,
          postedSlot: parsed.postedSlot,
          stalenessSlots,
          maxConf,
          isStale,
          isConfTooWide,
        }
        oracleByFeed.set(oracleFeed, out)
        return out
      } catch (error) {
        const out = {
          ok: false as const,
          error: error instanceof Error ? error.message : "Unknown oracle fetch error",
        }
        oracleByFeed.set(oracleFeed, out)
        return out
      }
    }

    const marketByKey = new Map(markets.map((m) => [m.market, m] as const))
    await Promise.all(markets.map((m) => getOracleHealth(m.oracleFeed)))

    const shardRows = shards
      .map((s) => {
        const lastCrankSlot = BigInt(s.lastCrankSlot)
        const crankStalenessSlots = nowSlot - lastCrankSlot
        const isCrankStale =
          crankStalenessSlots < 0n || crankStalenessSlots > MAX_CRANK_STALENESS_SLOTS
        const key = `${s.market}:${s.shard}`

        const market = marketByKey.get(s.market) ?? null
        const oracle =
          market?.oracleFeed ? oracleByFeed.get(market.oracleFeed) ?? null : null

        const oraclePostedSlot =
          oracle && oracle.ok ? oracle.postedSlot.toString(10) : null
        const oracleStalenessSlots =
          oracle && oracle.ok
            ? oracle.stalenessSlots < 0n
              ? "0"
              : oracle.stalenessSlots.toString(10)
            : null

        return {
          market: s.market,
          shard: s.shard,
          shardId: s.shardId,
          shardSeed: s.shardSeed,
          lastCrankSlot: lastCrankSlot.toString(10),
          crankStalenessSlots:
            crankStalenessSlots < 0n ? "0" : crankStalenessSlots.toString(10),
          isCrankStale,
          oracleFeed: market?.oracleFeed ?? null,
          oraclePrice: oracle && oracle.ok ? oracle.price.toString(10) : null,
          oracleConf: oracle && oracle.ok ? oracle.conf.toString(10) : null,
          oracleMaxConf: oracle && oracle.ok ? oracle.maxConf.toString(10) : null,
          oraclePostedSlot,
          oracleStalenessSlots,
          isOracleStale: oracle && oracle.ok ? oracle.isStale : true,
          isOracleConfTooWide: oracle && oracle.ok ? oracle.isConfTooWide : true,
          oracleError: oracle && !oracle.ok ? oracle.error : null,
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
      maxOracleStalenessSlots: MAX_ORACLE_STALENESS_SLOTS.toString(10),
      maxOracleConfidenceBps: MAX_ORACLE_CONFIDENCE_BPS.toString(10),
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

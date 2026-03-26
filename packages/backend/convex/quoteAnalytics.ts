import { mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"

const DAY_MS = 24 * 60 * 60 * 1000

export const recordQuote = mutationGeneric({
  args: {
    market: v.string(),
    shard: v.string(),
    owner: v.optional(v.string()),
    side: v.union(v.literal("long"), v.literal("short")),
    requestedNotional: v.int64(),
    depthServedNotional: v.int64(),
    fallbackNotional: v.int64(),
    usedFallback: v.boolean(),
    oraclePrice: v.int64(),
    execPrice: v.int64(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("quoteAnalytics", {
      ...args,
      indexedAt: Date.now(),
    })
  },
})

export const getRecentOwnerQuote = queryGeneric({
  args: {
    owner: v.string(),
    market: v.string(),
    shard: v.string(),
    side: v.union(v.literal("long"), v.literal("short")),
    maxAgeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("quoteAnalytics")
      .withIndex("by_owner", (q) => q.eq("owner", args.owner))
      .collect()

    const threshold = Date.now() - (args.maxAgeMs ?? 2 * 60 * 1000)
    return rows
      .filter(
        (row) =>
          row.market === args.market &&
          row.shard === args.shard &&
          row.side === args.side &&
          row.indexedAt >= threshold,
      )
      .sort((left, right) => right.indexedAt - left.indexedAt)[0] ?? null
  },
})

export const getMarketStats = queryGeneric({
  args: {
    market: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("quoteAnalytics").collect()
    const threshold = Date.now() - DAY_MS
    const scopedRows = rows.filter(
      (row) => row.indexedAt >= threshold && (args.market ? row.market === args.market : true),
    )

    const fallbackQuotes = scopedRows.filter((row) => row.usedFallback)
    const totalRequestedNotional = scopedRows.reduce(
      (sum, row) => sum + row.requestedNotional,
      0n,
    )
    const totalFallbackNotional = scopedRows.reduce(
      (sum, row) => sum + row.fallbackNotional,
      0n,
    )

    return {
      quotes24h: scopedRows.length,
      fallbackQuotes24h: fallbackQuotes.length,
      totalRequestedNotional: totalRequestedNotional.toString(10),
      totalFallbackNotional: totalFallbackNotional.toString(10),
      fallbackRateBps:
        totalRequestedNotional > 0n
          ? Number((totalFallbackNotional * 10_000n) / totalRequestedNotional)
          : 0,
    }
  },
})

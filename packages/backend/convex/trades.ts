import { mutationGeneric } from "convex/server"
import { v } from "convex/values"

import { computePositionAccountingFromTrades } from "./lib/trader_position"

export const applyTradeExecutedEvent = mutationGeneric({
  args: {
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    trader: v.string(),
    owner: v.string(),
    sizeQ: v.int64(),
    execPrice: v.int64(),
    oraclePrice: v.int64(),
    nowSlot: v.int64(),
    oraclePostedSlot: v.int64(),
  },
  handler: async (ctx, args) => {
    const existingTrade = await ctx.db
      .query("trades")
      .withIndex("by_signature", (q) => q.eq("signature", args.signature))
      .unique()
    if (existingTrade) return existingTrade._id

    const indexedAt = Date.now()
    const effectiveSpreadBps =
      args.oraclePrice === 0n
        ? 0
        : Number((args.execPrice - args.oraclePrice) * 10_000n / args.oraclePrice)
    const side = args.sizeQ >= 0n ? "long" : "short"
    const recentQuotes = await ctx.db
      .query("quoteAnalytics")
      .withIndex("by_owner", (q) => q.eq("owner", args.owner))
      .collect()
    const matchedQuote =
      recentQuotes
        .filter(
          (quote) =>
            quote.market === args.market &&
            quote.shard === args.shard &&
            quote.side === side &&
            indexedAt - quote.indexedAt <= 2 * 60 * 1000,
        )
        .sort((left, right) => right.indexedAt - left.indexedAt)[0] ?? null

    const tradeId = await ctx.db.insert("trades", {
      signature: args.signature,
      slot: args.slot,
      market: args.market,
      shard: args.shard,
      trader: args.trader,
      owner: args.owner,
      sizeQ: args.sizeQ,
      execPrice: args.execPrice,
      oraclePrice: args.oraclePrice,
      effectiveSpreadBps,
      usedFallback: matchedQuote?.usedFallback,
      fallbackNotional: matchedQuote?.fallbackNotional,
      nowSlot: args.nowSlot,
      oraclePostedSlot: args.oraclePostedSlot,
      indexedAt,
    })

    const traderDoc = await ctx.db
      .query("traders")
      .withIndex("by_trader", (q) => q.eq("trader", args.trader))
      .unique()

    const existingPosition = await ctx.db
      .query("positionsView")
      .withIndex("by_trader", (q) => q.eq("trader", args.trader))
      .unique()

    const traderTrades = (
      await ctx.db
        .query("trades")
        .withIndex("by_trader", (q) => q.eq("trader", args.trader))
        .collect()
    ).filter((trade) => trade.market === args.market && trade.shard === args.shard)

    const accounting = computePositionAccountingFromTrades(traderTrades)

    const patch = {
      market: args.market,
      shard: args.shard,
      trader: args.trader,
      owner: args.owner,
      engineIndex: traderDoc?.engineIndex ?? existingPosition?.engineIndex,
      positionSizeQ: accounting.positionSizeQ,
      averageEntryPrice: accounting.averageEntryPrice,
      realizedPnl: accounting.realizedPnl,
      lastExecPrice: args.execPrice,
      lastOraclePrice: args.oraclePrice,
      lastUpdatedSlot: args.nowSlot,
      indexedAt,
    }

    if (existingPosition) {
      await ctx.db.patch(existingPosition._id, patch)
      return tradeId
    }

    await ctx.db.insert("positionsView", patch)
    return tradeId
  },
})


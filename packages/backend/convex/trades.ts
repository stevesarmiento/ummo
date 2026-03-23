import { mutationGeneric } from "convex/server"
import { v } from "convex/values"

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

    const nextPositionSizeQ = (existingPosition?.positionSizeQ ?? 0n) + args.sizeQ

    const patch = {
      market: args.market,
      shard: args.shard,
      trader: args.trader,
      owner: args.owner,
      engineIndex: traderDoc?.engineIndex ?? existingPosition?.engineIndex,
      positionSizeQ: nextPositionSizeQ,
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


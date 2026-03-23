import { mutationGeneric } from "convex/server"
import { v } from "convex/values"

export const applyCrankEvent = mutationGeneric({
  args: {
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    nowSlot: v.int64(),
    lastCrankSlot: v.int64(),
    advanced: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cranks")
      .withIndex("by_signature", (q) => q.eq("signature", args.signature))
      .unique()
    if (existing) return existing._id

    const crankId = await ctx.db.insert("cranks", {
      signature: args.signature,
      slot: args.slot,
      market: args.market,
      shard: args.shard,
      nowSlot: args.nowSlot,
      lastCrankSlot: args.lastCrankSlot,
      advanced: args.advanced,
      indexedAt: Date.now(),
    })

    const shardDoc = await ctx.db
      .query("shards")
      .withIndex("by_shard", (q) => q.eq("shard", args.shard))
      .unique()

    if (shardDoc) {
      await ctx.db.patch(shardDoc._id, {
        lastCrankSlot: args.lastCrankSlot,
        indexedAt: Date.now(),
      })
    }

    return crankId
  },
})


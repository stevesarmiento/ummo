import { mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"

export const listByShard = queryGeneric({
  args: {
    shard: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50
    const rows = await ctx.db
      .query("fundingUpdates")
      .withIndex("by_shard", (q) => q.eq("shard", args.shard))
      .order("desc")
      .take(limit)
    return rows
  },
})

export const applyFundingRateUpdatedEvent = mutationGeneric({
  args: {
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    nowSlot: v.int64(),
    oldRateBpsPerSlot: v.int64(),
    newRateBpsPerSlot: v.int64(),
    intervalSlots: v.int64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("fundingUpdates")
      .withIndex("by_signature", (q) => q.eq("signature", args.signature))
      .unique()
    if (existing) return existing._id

    const fundingId = await ctx.db.insert("fundingUpdates", {
      ...args,
      indexedAt: Date.now(),
    })

    const shardDoc = await ctx.db
      .query("shards")
      .withIndex("by_shard", (q) => q.eq("shard", args.shard))
      .unique()
    if (shardDoc) {
      await ctx.db.patch(shardDoc._id, {
        fundingUpdatedAtSlot: args.nowSlot,
        fundingRateBpsPerSlot: args.newRateBpsPerSlot,
        indexedAt: Date.now(),
      })
    }

    return fundingId
  },
})


import { mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"

export const getByShard = queryGeneric({
  args: {
    shard: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shards")
      .withIndex("by_shard", (q) => q.eq("shard", args.shard))
      .unique()
  },
})

export const listByMarket = queryGeneric({
  args: {
    market: v.string(),
  },
  handler: async (ctx, args) => {
    const shards = await ctx.db
      .query("shards")
      .withIndex("by_market", (q) => q.eq("market", args.market))
      .collect()
    shards.sort((a, b) => a.shardId - b.shardId)
    return shards
  },
})

export const upsertFromShardInitializedEvent = mutationGeneric({
  args: {
    shard: v.string(),
    market: v.string(),
    authority: v.string(),
    shardSeed: v.string(),
    shardId: v.number(),
    houseEngineIndex: v.number(),
    createdAtSlot: v.int64(),
    lastCrankSlot: v.int64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("shards")
      .withIndex("by_shard", (q) => q.eq("shard", args.shard))
      .unique()

    const patch = {
      ...args,
      indexedAt: Date.now(),
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }

    return await ctx.db.insert("shards", patch)
  },
})


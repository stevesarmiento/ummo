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

export const applyRiskStateUpdatedEvent = mutationGeneric({
  args: {
    shard: v.string(),
    riskUpdatedAtSlot: v.int64(),
    oraclePrice: v.int64(),
    riskPrice: v.int64(),
    emaSymPrice: v.int64(),
    emaDirDownPrice: v.int64(),
    emaDirUpPrice: v.int64(),
  },
  handler: async (ctx, args) => {
    const shardDoc = await ctx.db
      .query("shards")
      .withIndex("by_shard", (q) => q.eq("shard", args.shard))
      .unique()
    if (!shardDoc) return null

    await ctx.db.patch(shardDoc._id, {
      ...args,
      indexedAt: Date.now(),
    })
    return shardDoc._id
  },
})

export const applyRiskConfigUpdatedEvent = mutationGeneric({
  args: {
    shard: v.string(),
    riskUpdatedAtSlot: v.int64(),
    riskSymHalfLifeSlots: v.int64(),
    riskDirHalfLifeSlots: v.int64(),
  },
  handler: async (ctx, args) => {
    const shardDoc = await ctx.db
      .query("shards")
      .withIndex("by_shard", (q) => q.eq("shard", args.shard))
      .unique()
    if (!shardDoc) return null

    await ctx.db.patch(shardDoc._id, {
      ...args,
      indexedAt: Date.now(),
    })
    return shardDoc._id
  },
})

export const applyRailsUpdatedEvent = mutationGeneric({
  args: {
    shard: v.string(),
    railsUpdatedAtSlot: v.int64(),
    railsFirstTierMaxNotional: v.int64(),
    railsFirstTierMaxOracleDeviationBps: v.number(),
    railsSecondTierMaxNotional: v.int64(),
    railsSecondTierMaxOracleDeviationBps: v.number(),
    railsThirdTierMaxNotional: v.int64(),
    railsThirdTierMaxOracleDeviationBps: v.number(),
  },
  handler: async (ctx, args) => {
    const shardDoc = await ctx.db
      .query("shards")
      .withIndex("by_shard", (q) => q.eq("shard", args.shard))
      .unique()
    if (!shardDoc) return null

    await ctx.db.patch(shardDoc._id, {
      ...args,
      indexedAt: Date.now(),
    })
    return shardDoc._id
  },
})

export const applyLiquidationConfigUpdatedEvent = mutationGeneric({
  args: {
    shard: v.string(),
    liquidationConfigUpdatedAtSlot: v.int64(),
    liquidationBountyIsEnabled: v.boolean(),
    liquidationBountyShareBps: v.number(),
    liquidationBountyCapAbs: v.int64(),
  },
  handler: async (ctx, args) => {
    const shardDoc = await ctx.db
      .query("shards")
      .withIndex("by_shard", (q) => q.eq("shard", args.shard))
      .unique()
    if (!shardDoc) return null

    await ctx.db.patch(shardDoc._id, {
      ...args,
      indexedAt: Date.now(),
    })
    return shardDoc._id
  },
})


import { mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"

export const listByPool = queryGeneric({
  args: {
    lpPool: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("lpBandConfigs")
      .withIndex("by_lp_pool", (q) => q.eq("lpPool", args.lpPool))
      .collect()
  },
})

export const upsertFromConfiguredEvent = mutationGeneric({
  args: {
    lpPool: v.string(),
    market: v.string(),
    shard: v.string(),
    owner: v.string(),
    lpBandConfig: v.string(),
    firstBandMaxNotional: v.int64(),
    firstBandMaxOracleDeviationBps: v.number(),
    firstBandSpreadBps: v.number(),
    firstBandMaxInventoryBps: v.number(),
    secondBandMaxNotional: v.int64(),
    secondBandMaxOracleDeviationBps: v.number(),
    secondBandSpreadBps: v.number(),
    secondBandMaxInventoryBps: v.number(),
    thirdBandMaxNotional: v.int64(),
    thirdBandMaxOracleDeviationBps: v.number(),
    thirdBandSpreadBps: v.number(),
    thirdBandMaxInventoryBps: v.number(),
    updatedAtSlot: v.int64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("lpBandConfigs")
      .withIndex("by_lp_band_config", (q) => q.eq("lpBandConfig", args.lpBandConfig))
      .unique()

    const patch = {
      ...args,
      indexedAt: Date.now(),
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }

    return await ctx.db.insert("lpBandConfigs", patch)
  },
})

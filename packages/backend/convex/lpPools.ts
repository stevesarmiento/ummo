import { mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"

export const getByShard = queryGeneric({
  args: { shard: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("lpPools")
      .withIndex("by_shard", (q) => q.eq("shard", args.shard))
      .unique()
  },
})

export const upsertFromInitializedEvent = mutationGeneric({
  args: {
    lpPool: v.string(),
    market: v.string(),
    shard: v.string(),
    collateralMint: v.string(),
    pooledEngineIndex: v.number(),
    lpFeeBps: v.number(),
    protocolFeeBps: v.number(),
    createdAtSlot: v.int64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("lpPools")
      .withIndex("by_lp_pool", (q) => q.eq("lpPool", args.lpPool))
      .unique()

    const patch = {
      ...args,
      totalShares: 0n,
      accountingNav: 0n,
      totalDeposited: 0n,
      protocolFeeAccrued: 0n,
      indexedAt: Date.now(),
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }

    return await ctx.db.insert("lpPools", patch)
  },
})

export const applyLpDepositEvent = mutationGeneric({
  args: {
    lpPool: v.string(),
    market: v.string(),
    shard: v.string(),
    owner: v.string(),
    lpPosition: v.string(),
    shares: v.int64(),
    accountingNav: v.int64(),
  },
  handler: async (ctx, args) => {
    const existingPool = await ctx.db
      .query("lpPools")
      .withIndex("by_lp_pool", (q) => q.eq("lpPool", args.lpPool))
      .unique()
    if (!existingPool) return null

    await ctx.db.patch(existingPool._id, {
      totalShares: existingPool.totalShares + args.shares,
      accountingNav: args.accountingNav,
      totalDeposited: existingPool.totalDeposited + args.accountingNav,
      indexedAt: Date.now(),
    })

    return existingPool._id
  },
})

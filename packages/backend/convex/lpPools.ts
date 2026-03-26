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
      cashNav: 0n,
      estimatedNav: 0n,
      totalDeposited: 0n,
      protocolFeeAccrued: 0n,
      pendingRedemptionShares: 0n,
      pendingRedemptionValue: 0n,
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

    const cashNav = existingPool.cashNav ?? existingPool.accountingNav
    const estimatedNav = existingPool.estimatedNav ?? existingPool.accountingNav
    const navDelta = args.accountingNav - existingPool.accountingNav

    await ctx.db.patch(existingPool._id, {
      totalShares: existingPool.totalShares + args.shares,
      accountingNav: args.accountingNav,
      cashNav: cashNav + navDelta,
      estimatedNav: args.accountingNav,
      totalDeposited: existingPool.totalDeposited + navDelta,
      indexedAt: Date.now(),
    })

    return existingPool._id
  },
})

export const applyWithdrawalRequestedEvent = mutationGeneric({
  args: {
    lpPool: v.string(),
    requestedShares: v.int64(),
    estimatedAmount: v.int64(),
  },
  handler: async (ctx, args) => {
    const existingPool = await ctx.db
      .query("lpPools")
      .withIndex("by_lp_pool", (q) => q.eq("lpPool", args.lpPool))
      .unique()
    if (!existingPool) return null

    const pendingRedemptionShares = existingPool.pendingRedemptionShares ?? 0n
    const pendingRedemptionValue = existingPool.pendingRedemptionValue ?? 0n

    await ctx.db.patch(existingPool._id, {
      pendingRedemptionShares:
        pendingRedemptionShares + args.requestedShares,
      pendingRedemptionValue:
        pendingRedemptionValue + args.estimatedAmount,
      indexedAt: Date.now(),
    })

    return existingPool._id
  },
})

export const applyWithdrawalClaimedEvent = mutationGeneric({
  args: {
    lpPool: v.string(),
    burnedShares: v.int64(),
    claimedAmount: v.int64(),
  },
  handler: async (ctx, args) => {
    const existingPool = await ctx.db
      .query("lpPools")
      .withIndex("by_lp_pool", (q) => q.eq("lpPool", args.lpPool))
      .unique()
    if (!existingPool) return null

    const cashNav = existingPool.cashNav ?? existingPool.accountingNav
    const estimatedNav = existingPool.estimatedNav ?? existingPool.accountingNav
    const pendingRedemptionShares = existingPool.pendingRedemptionShares ?? 0n
    const pendingRedemptionValue = existingPool.pendingRedemptionValue ?? 0n

    await ctx.db.patch(existingPool._id, {
      totalShares: existingPool.totalShares - args.burnedShares,
      accountingNav: existingPool.accountingNav - args.claimedAmount,
      cashNav: cashNav - args.claimedAmount,
      estimatedNav: estimatedNav - args.claimedAmount,
      pendingRedemptionShares:
        pendingRedemptionShares - args.burnedShares,
      pendingRedemptionValue:
        pendingRedemptionValue - args.claimedAmount,
      indexedAt: Date.now(),
    })

    return existingPool._id
  },
})

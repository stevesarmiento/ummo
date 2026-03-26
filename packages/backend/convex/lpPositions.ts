import { mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"

export const listByOwnerMarket = queryGeneric({
  args: {
    owner: v.string(),
    market: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("lpPositions")
      .withIndex("by_owner", (q) => q.eq("owner", args.owner))
      .collect()
    return rows.filter((row) => row.market === args.market)
  },
})

export const listByPool = queryGeneric({
  args: {
    lpPool: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("lpPositions")
      .withIndex("by_lp_pool", (q) => q.eq("lpPool", args.lpPool))
      .collect()
  },
})

export const upsertFromOpenedEvent = mutationGeneric({
  args: {
    lpPool: v.string(),
    market: v.string(),
    shard: v.string(),
    owner: v.string(),
    lpPosition: v.string(),
    shares: v.int64(),
    depositedTotal: v.int64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("lpPositions")
      .withIndex("by_lp_position", (q) => q.eq("lpPosition", args.lpPosition))
      .unique()

    const patch = {
      ...args,
      lockedShares: existing?.lockedShares ?? 0n,
      pendingWithdrawShares: existing?.pendingWithdrawShares ?? 0n,
      pendingWithdrawAmount: existing?.pendingWithdrawAmount ?? 0n,
      pendingWithdrawClaimableAtSlot: existing?.pendingWithdrawClaimableAtSlot,
      indexedAt: Date.now(),
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }

    return await ctx.db.insert("lpPositions", patch)
  },
})

export const applyWithdrawalRequestedEvent = mutationGeneric({
  args: {
    lpPosition: v.string(),
    requestedShares: v.int64(),
    estimatedAmount: v.int64(),
    claimableAtSlot: v.int64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("lpPositions")
      .withIndex("by_lp_position", (q) => q.eq("lpPosition", args.lpPosition))
      .unique()
    if (!existing) return null

    const lockedShares = existing.lockedShares ?? 0n

    await ctx.db.patch(existing._id, {
      lockedShares: lockedShares + args.requestedShares,
      pendingWithdrawShares: args.requestedShares,
      pendingWithdrawAmount: args.estimatedAmount,
      pendingWithdrawClaimableAtSlot: args.claimableAtSlot,
      indexedAt: Date.now(),
    })

    return existing._id
  },
})

export const applyWithdrawalClaimedEvent = mutationGeneric({
  args: {
    lpPosition: v.string(),
    burnedShares: v.int64(),
    claimedAmount: v.int64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("lpPositions")
      .withIndex("by_lp_position", (q) => q.eq("lpPosition", args.lpPosition))
      .unique()
    if (!existing) return null

    const lockedShares = existing.lockedShares ?? 0n

    await ctx.db.patch(existing._id, {
      shares: existing.shares - args.burnedShares,
      lockedShares: lockedShares - args.burnedShares,
      pendingWithdrawShares: 0n,
      pendingWithdrawAmount: 0n,
      pendingWithdrawClaimableAtSlot: undefined,
      indexedAt: Date.now(),
    })

    return existing._id
  },
})

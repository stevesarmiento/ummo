import { mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"

export const listByOwnerMarket = queryGeneric({
  args: {
    owner: v.string(),
    market: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("lpRedemptions")
      .withIndex("by_owner", (q) => q.eq("owner", args.owner))
      .collect()
    return rows
      .filter((row) => row.market === args.market)
      .sort((left, right) => Number(right.requestSlot - left.requestSlot))
  },
})

export const applyRequestedEvent = mutationGeneric({
  args: {
    requestSignature: v.string(),
    requestSlot: v.int64(),
    market: v.string(),
    shard: v.string(),
    lpPool: v.string(),
    owner: v.string(),
    lpPosition: v.string(),
    requestedShares: v.int64(),
    estimatedAmount: v.int64(),
    claimableAtSlot: v.int64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("lpRedemptions")
      .withIndex("by_request_signature", (q) => q.eq("requestSignature", args.requestSignature))
      .unique()
    if (existing) return existing._id

    return await ctx.db.insert("lpRedemptions", {
      ...args,
      status: "pending",
      indexedAt: Date.now(),
    })
  },
})

export const applyClaimedEvent = mutationGeneric({
  args: {
    lpPosition: v.string(),
    owner: v.string(),
    claimSignature: v.string(),
    claimSlot: v.int64(),
    claimedAmount: v.int64(),
  },
  handler: async (ctx, args) => {
    const pending = (
      await ctx.db
        .query("lpRedemptions")
        .withIndex("by_lp_position", (q) => q.eq("lpPosition", args.lpPosition))
        .collect()
    )
      .filter((row) => row.owner === args.owner && row.status === "pending")
      .sort((left, right) => Number(right.requestSlot - left.requestSlot))[0] ?? null
    if (!pending) return null

    await ctx.db.patch(pending._id, {
      status: "claimed",
      claimSignature: args.claimSignature,
      claimSlot: args.claimSlot,
      claimedAmount: args.claimedAmount,
      indexedAt: Date.now(),
    })

    return pending._id
  },
})

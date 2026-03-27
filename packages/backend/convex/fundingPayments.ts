import { mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"

export const applyFundingPaymentEvent = mutationGeneric({
  args: {
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    trader: v.string(),
    owner: v.string(),
    engineIndex: v.number(),
    nowSlot: v.int64(),
    deltaFundingPnl: v.int64(),
    cumulativeFundingPnl: v.int64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("fundingPayments")
      .withIndex("by_signature", (q) => q.eq("signature", args.signature))
      .unique()

    const patch = { ...args, indexedAt: Date.now() }
    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }
    return await ctx.db.insert("fundingPayments", patch)
  },
})

export const listByOwnerMarketShard = queryGeneric({
  args: {
    owner: v.string(),
    market: v.string(),
    shard: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200))
    const rows = await ctx.db
      .query("fundingPayments")
      .withIndex("by_owner", (q) => q.eq("owner", args.owner))
      .order("desc")
      .take(limit * 4)

    const filtered = rows.filter((row) => row.market === args.market && row.shard === args.shard)
    filtered.sort((a, b) => Number(b.nowSlot - a.nowSlot))
    return filtered.slice(0, limit)
  },
})


import { mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"

export const list = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const markets = await ctx.db.query("markets").collect()
    markets.sort((a, b) => Number(a.marketId - b.marketId))
    return markets
  },
})

export const getByMarket = queryGeneric({
  args: {
    market: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("markets")
      .withIndex("by_market", (q) => q.eq("market", args.market))
      .unique()
  },
})

export const upsertFromInitEvent = mutationGeneric({
  args: {
    market: v.string(),
    authority: v.string(),
    collateralMint: v.string(),
    oracleFeed: v.string(),
    matcherAuthority: v.string(),
    marketId: v.int64(),
    createdAtSlot: v.int64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("markets")
      .withIndex("by_market", (q) => q.eq("market", args.market))
      .unique()

    const patch = {
      ...args,
      indexedAt: Date.now(),
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }

    return await ctx.db.insert("markets", patch)
  },
})

export const applyMatcherAuthorityUpdatedEvent = mutationGeneric({
  args: {
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    authority: v.string(),
    oldMatcherAuthority: v.string(),
    newMatcherAuthority: v.string(),
    nowSlot: v.int64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("matcherAuthorityUpdates")
      .withIndex("by_signature", (q) => q.eq("signature", args.signature))
      .unique()
    if (existing) return existing._id

    const indexedAt = Date.now()

    const updateId = await ctx.db.insert("matcherAuthorityUpdates", {
      signature: args.signature,
      slot: args.slot,
      market: args.market,
      authority: args.authority,
      oldMatcherAuthority: args.oldMatcherAuthority,
      newMatcherAuthority: args.newMatcherAuthority,
      nowSlot: args.nowSlot,
      indexedAt,
    })

    const marketDoc = await ctx.db
      .query("markets")
      .withIndex("by_market", (q) => q.eq("market", args.market))
      .unique()

    if (marketDoc) {
      await ctx.db.patch(marketDoc._id, {
        matcherAuthority: args.newMatcherAuthority,
        indexedAt,
      })
    }

    return updateId
  },
})


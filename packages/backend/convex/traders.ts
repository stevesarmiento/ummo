import { mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"

export const getByOwnerMarket = queryGeneric({
  args: {
    owner: v.string(),
    market: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("traders")
      .withIndex("by_owner", (q) => q.eq("owner", args.owner))
      .collect()
    return rows.filter((r) => r.market === args.market)
  },
})

export const upsertFromOpenedEvent = mutationGeneric({
  args: {
    market: v.string(),
    shard: v.string(),
    trader: v.string(),
    owner: v.string(),
    engineIndex: v.number(),
    openedAtSlot: v.int64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("traders")
      .withIndex("by_trader", (q) => q.eq("trader", args.trader))
      .unique()

    const patch = {
      ...args,
      indexedAt: Date.now(),
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }

    return await ctx.db.insert("traders", {
      ...patch,
      collateralBalance: 0n,
    })
  },
})

export const applyDepositEvent = mutationGeneric({
  args: {
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    trader: v.string(),
    owner: v.string(),
    engineIndex: v.number(),
    amount: v.int64(),
  },
  handler: async (ctx, args) => {
    const existingDeposit = await ctx.db
      .query("deposits")
      .withIndex("by_signature", (q) => q.eq("signature", args.signature))
      .unique()
    if (existingDeposit) return existingDeposit._id

    const depositId = await ctx.db.insert("deposits", {
      signature: args.signature,
      slot: args.slot,
      market: args.market,
      shard: args.shard,
      trader: args.trader,
      owner: args.owner,
      engineIndex: args.engineIndex,
      amount: args.amount,
      indexedAt: Date.now(),
    })

    const existingTrader = await ctx.db
      .query("traders")
      .withIndex("by_trader", (q) => q.eq("trader", args.trader))
      .unique()

    if (existingTrader) {
      await ctx.db.patch(existingTrader._id, {
        collateralBalance: existingTrader.collateralBalance + args.amount,
        indexedAt: Date.now(),
      })
      return depositId
    }

    await ctx.db.insert("traders", {
      market: args.market,
      shard: args.shard,
      trader: args.trader,
      owner: args.owner,
      engineIndex: args.engineIndex,
      collateralBalance: args.amount,
      openedAtSlot: args.slot,
      indexedAt: Date.now(),
    })

    return depositId
  },
})


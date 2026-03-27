import { mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"

export const getByOwnerMarket = queryGeneric({
  args: {
    liquidateeOwner: v.string(),
    market: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("liquidations")
      .withIndex("by_owner", (q) => q.eq("liquidateeOwner", args.liquidateeOwner))
      .collect()
    return rows.filter((r) => r.market === args.market)
  },
})

export const applyLiquidationEvent = mutationGeneric({
  args: {
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    keeper: v.string(),
    liquidateeOwner: v.string(),
    liquidateeEngineIndex: v.number(),
    liquidated: v.boolean(),
    oldEffectivePosQ: v.int64(),
    nowSlot: v.int64(),
    oraclePrice: v.int64(),
    oraclePostedSlot: v.int64(),
    bountyPaid: v.optional(v.int64()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("liquidations")
      .withIndex("by_signature", (q) => q.eq("signature", args.signature))
      .unique()
    if (existing) return existing._id

    const indexedAt = Date.now()

    const liquidationId = await ctx.db.insert("liquidations", {
      signature: args.signature,
      slot: args.slot,
      market: args.market,
      shard: args.shard,
      keeper: args.keeper,
      liquidateeOwner: args.liquidateeOwner,
      liquidateeEngineIndex: args.liquidateeEngineIndex,
      liquidated: args.liquidated,
      oldEffectivePosQ: args.oldEffectivePosQ,
      nowSlot: args.nowSlot,
      oraclePrice: args.oraclePrice,
      oraclePostedSlot: args.oraclePostedSlot,
      ...(args.bountyPaid !== undefined ? { bountyPaid: args.bountyPaid } : {}),
      indexedAt,
    })

    if (!args.liquidated) return liquidationId

    const traders = await ctx.db
      .query("traders")
      .withIndex("by_owner", (q) => q.eq("owner", args.liquidateeOwner))
      .collect()

    const traderDoc = traders.find(
      (t) =>
        t.market === args.market && t.engineIndex === args.liquidateeEngineIndex,
    )

    if (!traderDoc) return liquidationId

    const positionDoc = await ctx.db
      .query("positionsView")
      .withIndex("by_trader", (q) => q.eq("trader", traderDoc.trader))
      .unique()

    const patch = {
      market: args.market,
      shard: args.shard,
      trader: traderDoc.trader,
      owner: traderDoc.owner,
      engineIndex: traderDoc.engineIndex,
      positionSizeQ: 0n,
      averageEntryPrice: 0n,
      lastExecPrice: args.oraclePrice,
      lastOraclePrice: args.oraclePrice,
      realizedPnl: positionDoc?.realizedPnl ?? 0n,
      lastUpdatedSlot: args.nowSlot,
      indexedAt,
    }

    if (positionDoc) {
      await ctx.db.patch(positionDoc._id, patch)
      return liquidationId
    }

    await ctx.db.insert("positionsView", patch)
    return liquidationId
  },
})

export const applyLiquidationBountyPaidEvent = mutationGeneric({
  args: {
    signature: v.string(),
    bountyPaid: v.int64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("liquidations")
      .withIndex("by_signature", (q) => q.eq("signature", args.signature))
      .unique()

    if (!existing) return null

    await ctx.db.patch(existing._id, { bountyPaid: args.bountyPaid })
    return existing._id
  },
})


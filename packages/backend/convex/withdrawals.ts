import { mutationGeneric } from "convex/server"
import { v } from "convex/values"

export const applyWithdrawalEvent = mutationGeneric({
  args: {
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    trader: v.string(),
    owner: v.string(),
    engineIndex: v.number(),
    amount: v.int64(),
    nowSlot: v.int64(),
    oraclePrice: v.int64(),
    oraclePostedSlot: v.int64(),
  },
  handler: async (ctx, args) => {
    const existingWithdrawal = await ctx.db
      .query("withdrawals")
      .withIndex("by_signature", (q) => q.eq("signature", args.signature))
      .unique()
    if (existingWithdrawal) return existingWithdrawal._id

    const indexedAt = Date.now()

    const withdrawalId = await ctx.db.insert("withdrawals", {
      signature: args.signature,
      slot: args.slot,
      market: args.market,
      shard: args.shard,
      trader: args.trader,
      owner: args.owner,
      engineIndex: args.engineIndex,
      amount: args.amount,
      nowSlot: args.nowSlot,
      oraclePrice: args.oraclePrice,
      oraclePostedSlot: args.oraclePostedSlot,
      indexedAt,
    })

    const traderDoc = await ctx.db
      .query("traders")
      .withIndex("by_trader", (q) => q.eq("trader", args.trader))
      .unique()

    if (traderDoc) {
      await ctx.db.patch(traderDoc._id, {
        collateralBalance: traderDoc.collateralBalance - args.amount,
        indexedAt,
      })
    }

    return withdrawalId
  },
})


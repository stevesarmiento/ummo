import { mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"

function makeEventKey(args: {
  signature: string
  kind:
    | "accountClosed"
    | "traderClosed"
    | "accountReclaimed"
    | "dustGarbageCollected"
  owner?: string
  trader?: string
  engineIndex?: number
  nowSlot: bigint
}): string {
  const owner = args.owner ?? "-"
  const trader = args.trader ?? "-"
  const engineIndex =
    typeof args.engineIndex === "number" ? String(args.engineIndex) : "-"
  return `${args.signature}:${args.kind}:${owner}:${trader}:${engineIndex}:${args.nowSlot.toString()}`
}

export const listRecent = queryGeneric({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200))
    return await ctx.db
      .query("housekeepingEvents")
      .withIndex("by_indexedAt", (q) => q)
      .order("desc")
      .take(limit)
  },
})

export const applyTraderClosedEvent = mutationGeneric({
  args: {
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    trader: v.string(),
    owner: v.string(),
    engineIndex: v.number(),
    amountReturned: v.int64(),
    nowSlot: v.int64(),
  },
  handler: async (ctx, args) => {
    const eventKey = makeEventKey({
      signature: args.signature,
      kind: "traderClosed",
      owner: args.owner,
      trader: args.trader,
      engineIndex: args.engineIndex,
      nowSlot: args.nowSlot,
    })

    const existing = await ctx.db
      .query("housekeepingEvents")
      .withIndex("by_event_key", (q) => q.eq("eventKey", eventKey))
      .unique()

    const patch = {
      eventKey,
      signature: args.signature,
      slot: args.slot,
      market: args.market,
      shard: args.shard,
      kind: "traderClosed" as const,
      owner: args.owner,
      trader: args.trader,
      engineIndex: args.engineIndex,
      amountReturned: args.amountReturned,
      nowSlot: args.nowSlot,
      indexedAt: Date.now(),
    }

    const id = existing
      ? (await ctx.db.patch(existing._id, patch), existing._id)
      : await ctx.db.insert("housekeepingEvents", patch)

    const existingTrader = await ctx.db
      .query("traders")
      .withIndex("by_trader", (q) => q.eq("trader", args.trader))
      .unique()
    if (existingTrader) await ctx.db.delete(existingTrader._id)

    return id
  },
})

export const applyAccountClosedEvent = mutationGeneric({
  args: {
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    owner: v.string(),
    engineIndex: v.number(),
    amountReturned: v.int64(),
    nowSlot: v.int64(),
  },
  handler: async (ctx, args) => {
    const eventKey = makeEventKey({
      signature: args.signature,
      kind: "accountClosed",
      owner: args.owner,
      engineIndex: args.engineIndex,
      nowSlot: args.nowSlot,
    })

    const existing = await ctx.db
      .query("housekeepingEvents")
      .withIndex("by_event_key", (q) => q.eq("eventKey", eventKey))
      .unique()

    const patch = {
      eventKey,
      signature: args.signature,
      slot: args.slot,
      market: args.market,
      shard: args.shard,
      kind: "accountClosed" as const,
      owner: args.owner,
      engineIndex: args.engineIndex,
      amountReturned: args.amountReturned,
      nowSlot: args.nowSlot,
      indexedAt: Date.now(),
    }

    const id = existing
      ? (await ctx.db.patch(existing._id, patch), existing._id)
      : await ctx.db.insert("housekeepingEvents", patch)

    const ownerRows = await ctx.db
      .query("traders")
      .withIndex("by_owner", (q) => q.eq("owner", args.owner))
      .collect()
    const matches = ownerRows.filter(
      (r) =>
        r.market === args.market &&
        r.shard === args.shard &&
        r.engineIndex === args.engineIndex,
    )
    await Promise.all(matches.map((r) => ctx.db.delete(r._id)))

    return id
  },
})

export const applyAccountReclaimedEvent = mutationGeneric({
  args: {
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    engineIndex: v.number(),
    dustSwept: v.int64(),
    nowSlot: v.int64(),
  },
  handler: async (ctx, args) => {
    const eventKey = makeEventKey({
      signature: args.signature,
      kind: "accountReclaimed",
      engineIndex: args.engineIndex,
      nowSlot: args.nowSlot,
    })

    const existing = await ctx.db
      .query("housekeepingEvents")
      .withIndex("by_event_key", (q) => q.eq("eventKey", eventKey))
      .unique()

    const patch = {
      eventKey,
      signature: args.signature,
      slot: args.slot,
      market: args.market,
      shard: args.shard,
      kind: "accountReclaimed" as const,
      engineIndex: args.engineIndex,
      dustSwept: args.dustSwept,
      nowSlot: args.nowSlot,
      indexedAt: Date.now(),
    }

    return existing
      ? (await ctx.db.patch(existing._id, patch), existing._id)
      : await ctx.db.insert("housekeepingEvents", patch)
  },
})

export const applyDustGarbageCollectedEvent = mutationGeneric({
  args: {
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    numClosed: v.number(),
    dustSwept: v.int64(),
    nowSlot: v.int64(),
  },
  handler: async (ctx, args) => {
    const eventKey = makeEventKey({
      signature: args.signature,
      kind: "dustGarbageCollected",
      nowSlot: args.nowSlot,
    })

    const existing = await ctx.db
      .query("housekeepingEvents")
      .withIndex("by_event_key", (q) => q.eq("eventKey", eventKey))
      .unique()

    const patch = {
      eventKey,
      signature: args.signature,
      slot: args.slot,
      market: args.market,
      shard: args.shard,
      kind: "dustGarbageCollected" as const,
      dustSwept: args.dustSwept,
      numClosed: args.numClosed,
      nowSlot: args.nowSlot,
      indexedAt: Date.now(),
    }

    return existing
      ? (await ctx.db.patch(existing._id, patch), existing._id)
      : await ctx.db.insert("housekeepingEvents", patch)
  },
})


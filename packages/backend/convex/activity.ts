import { queryGeneric } from "convex/server"
import { v } from "convex/values"

export const getByOwnerMarketShard = queryGeneric({
  args: {
    owner: v.string(),
    market: v.string(),
    shard: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 25, 100))

    const [trades, withdrawals, depositsAll, liquidations, fundingPaymentsAll, housekeepingAll] =
      await Promise.all([
        ctx.db
          .query("trades")
          .withIndex("by_owner", (q) => q.eq("owner", args.owner))
          .collect(),
        ctx.db
          .query("withdrawals")
          .withIndex("by_owner", (q) => q.eq("owner", args.owner))
          .collect(),
        ctx.db
          .query("deposits")
          .withIndex("by_owner", (q) => q.eq("owner", args.owner))
          .collect(),
        ctx.db
          .query("liquidations")
          .withIndex("by_owner", (q) => q.eq("liquidateeOwner", args.owner))
          .collect(),
        ctx.db
          .query("fundingPayments")
          .withIndex("by_owner", (q) => q.eq("owner", args.owner))
          .order("desc")
          .take(limit * 2),
        ctx.db
          .query("housekeepingEvents")
          .withIndex("by_owner", (q) => q.eq("owner", args.owner))
          .order("desc")
          .take(limit * 2),
      ])

    const deposits = depositsAll.filter((d) => d.market === args.market && d.shard === args.shard)
    const fundingPayments = fundingPaymentsAll.filter(
      (p) => p.market === args.market && p.shard === args.shard,
    )
    const housekeeping = housekeepingAll.filter(
      (h) => h.market === args.market && h.shard === args.shard,
    )

    const events = [
      ...trades
        .filter((t) => t.market === args.market && t.shard === args.shard)
        .map((t) => ({
          type: "TradeExecuted" as const,
          signature: t.signature,
          slot: t.slot,
          market: t.market,
          shard: t.shard,
          sizeQ: t.sizeQ,
          execPrice: t.execPrice,
          nowSlot: t.nowSlot,
          indexedAt: t.indexedAt,
        })),
      ...withdrawals
        .filter((w) => w.market === args.market && w.shard === args.shard)
        .map((w) => ({
          type: "Withdrawal" as const,
          signature: w.signature,
          slot: w.slot,
          market: w.market,
          shard: w.shard,
          amount: w.amount,
          nowSlot: w.nowSlot,
          indexedAt: w.indexedAt,
        })),
      ...deposits.map((d) => ({
        type: "Deposit" as const,
        signature: d.signature,
        slot: d.slot,
        market: d.market,
        shard: d.shard,
        amount: d.amount,
        indexedAt: d.indexedAt,
      })),
      ...liquidations
        .filter((l) => l.market === args.market && l.shard === args.shard)
        .map((l) => ({
          type: "Liquidation" as const,
          signature: l.signature,
          slot: l.slot,
          market: l.market,
          shard: l.shard,
          liquidated: l.liquidated,
          liquidateeEngineIndex: l.liquidateeEngineIndex,
          nowSlot: l.nowSlot,
          indexedAt: l.indexedAt,
        })),
      ...fundingPayments.map((p) => ({
        type: "FundingPayment" as const,
        signature: p.signature,
        slot: p.slot,
        market: p.market,
        shard: p.shard,
        deltaFundingPnl: p.deltaFundingPnl,
        cumulativeFundingPnl: p.cumulativeFundingPnl,
        nowSlot: p.nowSlot,
        indexedAt: p.indexedAt,
      })),
      ...housekeeping.flatMap((h): any[] => {
        if (h.kind === "traderClosed")
          return [
            {
              type: "TraderClosed" as const,
              signature: h.signature,
              slot: h.slot,
              market: h.market,
              shard: h.shard,
              trader: h.trader,
              amountReturned: h.amountReturned,
              nowSlot: h.nowSlot,
              indexedAt: h.indexedAt,
            },
          ]

        if (h.kind === "accountClosed")
          return [
            {
              type: "AccountClosed" as const,
              signature: h.signature,
              slot: h.slot,
              market: h.market,
              shard: h.shard,
              engineIndex: h.engineIndex,
              amountReturned: h.amountReturned,
              nowSlot: h.nowSlot,
              indexedAt: h.indexedAt,
            },
          ]

        return []
      }),
    ] as Array<{ slot: bigint; indexedAt: number } & Record<string, unknown>>

    events.sort((a, b) => {
      const slotDiff = Number(b.slot - a.slot)
      if (slotDiff !== 0) return slotDiff
      return b.indexedAt - a.indexedAt
    })

    return events.slice(0, limit)
  },
})


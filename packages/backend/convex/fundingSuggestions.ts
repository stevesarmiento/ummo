import { queryGeneric } from "convex/server"
import { v } from "convex/values"

function absI64(value: bigint): bigint {
  return value < 0n ? -value : value
}

function clampI64(value: bigint): bigint {
  const min = -(2n ** 63n)
  const max = 2n ** 63n - 1n
  if (value < min) return min
  if (value > max) return max
  return value
}

export const getSuggestedRateForShard = queryGeneric({
  args: {
    shard: v.string(),
    endSlot: v.union(v.int64(), v.number(), v.string()),
    intervalSlots: v.union(v.int64(), v.number(), v.string()),
    maxAbsRateBpsPerSlot: v.optional(v.union(v.int64(), v.number(), v.string())),
  },
  handler: async (ctx, args) => {
    const maxAbs =
      typeof args.maxAbsRateBpsPerSlot === "bigint"
        ? args.maxAbsRateBpsPerSlot
        : args.maxAbsRateBpsPerSlot != null
          ? BigInt(args.maxAbsRateBpsPerSlot)
          : 10_000n
    const intervalSlotsRaw =
      typeof args.intervalSlots === "bigint" ? args.intervalSlots : BigInt(args.intervalSlots)
    const intervalSlots = intervalSlotsRaw > 0n ? intervalSlotsRaw : 150n
    const endSlot =
      typeof args.endSlot === "bigint" ? args.endSlot : BigInt(args.endSlot)
    const startSlot = endSlot > intervalSlots ? endSlot - intervalSlots : 0n

    const recentTrades = await ctx.db
      .query("trades")
      .withIndex("by_shard_now_slot", (q) =>
        q.eq("shard", args.shard),
      )
      .order("desc")
      .take(500)

    const trades = recentTrades.filter(
      (trade) =>
        (trade.nowSlot as bigint) >= startSlot && (trade.nowSlot as bigint) <= endSlot,
    )

    let notionalSum = 0n
    let weightedPremiumBpsSum = 0n

    for (const trade of trades) {
      const execPrice = trade.execPrice as bigint
      const oraclePrice = trade.oraclePrice as bigint
      const sizeQ = trade.sizeQ as bigint
      if (execPrice <= 0n || oraclePrice <= 0n) continue
      const absSizeQ = absI64(sizeQ)
      if (absSizeQ <= 0n) continue

      const notional = (absSizeQ * execPrice) / 1_000_000n
      if (notional <= 0n) continue

      // premiumBps = (exec - oracle) / oracle * 10_000
      const premiumBps = ((execPrice - oraclePrice) * 10_000n) / oraclePrice

      notionalSum += notional
      weightedPremiumBpsSum += premiumBps * notional
    }

    const weightedPremiumBps =
      notionalSum > 0n ? weightedPremiumBpsSum / notionalSum : 0n
    let suggestedRateBpsPerSlot = weightedPremiumBps / intervalSlots

    if (suggestedRateBpsPerSlot > maxAbs) suggestedRateBpsPerSlot = maxAbs
    if (suggestedRateBpsPerSlot < -maxAbs) suggestedRateBpsPerSlot = -maxAbs
    suggestedRateBpsPerSlot = clampI64(suggestedRateBpsPerSlot)

    return {
      shard: args.shard,
      intervalStartSlot: startSlot,
      intervalEndSlot: endSlot,
      tradeCount: trades.length,
      totalNotional: notionalSum,
      weightedPremiumBps,
      suggestedRateBpsPerSlot,
    }
  },
})


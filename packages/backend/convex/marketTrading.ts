import { mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"

const DEFAULT_TRADING_CONFIG = {
  defaultInputMode: "quote-notional" as const,
  maxLeverageX100: 1_000,
  leveragePresetsX100: [200, 300, 500, 750, 1_000],
  minOrderNotional: 5_000_000n,
  notionalStep: 1_000_000n,
  quantityStepQ: 10_000n,
  initialMarginBps: 1_000,
  maintenanceMarginBps: 500,
  removableCollateralBufferBps: 100,
  underlyingSymbol: "SOL",
  collateralSymbol: "USDC",
}

function getDefaultTradingConfig(market: string) {
  return {
    market,
    ...DEFAULT_TRADING_CONFIG,
  }
}

export const getByMarket = queryGeneric({
  args: {
    market: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("marketTradingConfigs")
      .withIndex("by_market", (q) => q.eq("market", args.market))
      .unique()
    if (existing) return existing

    return {
      ...getDefaultTradingConfig(args.market),
      indexedAt: 0,
    }
  },
})

export const upsertDefaultForMarket = mutationGeneric({
  args: {
    market: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("marketTradingConfigs")
      .withIndex("by_market", (q) => q.eq("market", args.market))
      .unique()

    const patch = {
      ...getDefaultTradingConfig(args.market),
      indexedAt: Date.now(),
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }

    return await ctx.db.insert("marketTradingConfigs", patch)
  },
})

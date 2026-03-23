import { queryGeneric } from "convex/server"
import { v } from "convex/values"

export const getByOwnerMarket = queryGeneric({
  args: {
    owner: v.string(),
    market: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("positionsView")
      .withIndex("by_owner", (q) => q.eq("owner", args.owner))
      .collect()
    return rows.filter((r) => r.market === args.market)
  },
})


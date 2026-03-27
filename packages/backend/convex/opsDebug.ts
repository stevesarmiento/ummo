import { queryGeneric } from "convex/server"
import { v } from "convex/values"

import { makeFunctionReference } from "convex/server"

const getTraderViewByOwnerMarketShard = makeFunctionReference<"query">(
  "traderViews:getByOwnerMarketShard",
)
const getActivityByOwnerMarketShard = makeFunctionReference<"query">(
  "activity:getByOwnerMarketShard",
)

export const debugGetDocById = queryGeneric({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id as never)
    return { id: args.id, doc }
  },
})

export const debugGetTraderBundleById = queryGeneric({
  args: { id: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const doc = (await ctx.db.get(args.id as never)) as
      | null
      | {
          owner?: unknown
          market?: unknown
          shard?: unknown
          trader?: unknown
        }

    if (!doc) return { id: args.id, found: false as const }

    const owner = typeof doc.owner === "string" ? doc.owner : null
    const market = typeof doc.market === "string" ? doc.market : null
    const shard = typeof doc.shard === "string" ? doc.shard : null

    if (!owner || !market || !shard) {
      return {
        id: args.id,
        found: true as const,
        doc,
        bundle: null,
        reason: "Document is not a trader-shaped row (missing owner/market/shard).",
      }
    }

    const [traderView, activity] = await Promise.all([
      ctx.runQuery(getTraderViewByOwnerMarketShard, { owner, market, shard }),
      ctx.runQuery(getActivityByOwnerMarketShard, {
        owner,
        market,
        shard,
        limit: args.limit ?? 50,
      }),
    ])

    return {
      id: args.id,
      found: true as const,
      doc,
      bundle: { owner, market, shard, traderView, activity },
    }
  },
})


import { queryGeneric } from "convex/server"
import { v } from "convex/values"

interface MatcherErrorRow {
  kind: string
  message: string
  signer?: string
  oracleFeed?: string
  rpcUrl?: string
  indexedAt: number
}

export const getRecentMatcherErrors = queryGeneric({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 25, 100))
    const rows = (await ctx.db
      .query("matcherErrors")
      .withIndex("by_indexedAt", (q) => q)
      .order("desc")
      .take(limit)) as MatcherErrorRow[]
    return rows
  },
})


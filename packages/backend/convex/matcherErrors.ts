import { mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"

export const insert = mutationGeneric({
  args: {
    kind: v.string(),
    message: v.string(),
    signer: v.optional(v.string()),
    oracleFeed: v.optional(v.string()),
    rpcUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("matcherErrors", {
      kind: args.kind,
      message: args.message,
      signer: args.signer,
      oracleFeed: args.oracleFeed,
      rpcUrl: args.rpcUrl,
      indexedAt: Date.now(),
    })
  },
})

export const listRecent = queryGeneric({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("matcherErrors").collect()
    rows.sort((a, b) => b.indexedAt - a.indexedAt)
    return rows.slice(0, args.limit ?? 25)
  },
})


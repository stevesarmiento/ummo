import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  markets: defineTable({
    market: v.string(),
    authority: v.string(),
    collateralMint: v.string(),
    oracleFeed: v.string(),
    matcherAuthority: v.string(),
    marketId: v.int64(),
    createdAtSlot: v.int64(),
    indexedAt: v.number(),
  })
    .index("by_market", ["market"])
    .index("by_oracle_feed", ["oracleFeed"]),

  marketTradingConfigs: defineTable({
    market: v.string(),
    defaultInputMode: v.union(
      v.literal("quote-notional"),
      v.literal("base-quantity"),
    ),
    maxLeverageX100: v.number(),
    leveragePresetsX100: v.array(v.number()),
    minOrderNotional: v.int64(),
    notionalStep: v.int64(),
    quantityStepQ: v.int64(),
    initialMarginBps: v.number(),
    maintenanceMarginBps: v.number(),
    removableCollateralBufferBps: v.number(),
    underlyingSymbol: v.string(),
    collateralSymbol: v.string(),
    indexedAt: v.number(),
  }).index("by_market", ["market"]),

  shards: defineTable({
    shard: v.string(),
    market: v.string(),
    authority: v.string(),
    shardSeed: v.string(),
    shardId: v.number(),
    houseEngineIndex: v.number(),
    createdAtSlot: v.int64(),
    lastCrankSlot: v.int64(),
    riskUpdatedAtSlot: v.optional(v.int64()),
    oraclePrice: v.optional(v.int64()),
    riskPrice: v.optional(v.int64()),
    emaSymPrice: v.optional(v.int64()),
    emaDirDownPrice: v.optional(v.int64()),
    emaDirUpPrice: v.optional(v.int64()),
    riskSymHalfLifeSlots: v.optional(v.int64()),
    riskDirHalfLifeSlots: v.optional(v.int64()),
    railsUpdatedAtSlot: v.optional(v.int64()),
    railsFirstTierMaxNotional: v.optional(v.int64()),
    railsFirstTierMaxOracleDeviationBps: v.optional(v.number()),
    railsSecondTierMaxNotional: v.optional(v.int64()),
    railsSecondTierMaxOracleDeviationBps: v.optional(v.number()),
    railsThirdTierMaxNotional: v.optional(v.int64()),
    railsThirdTierMaxOracleDeviationBps: v.optional(v.number()),
    liquidationConfigUpdatedAtSlot: v.optional(v.int64()),
    liquidationBountyIsEnabled: v.optional(v.boolean()),
    liquidationBountyShareBps: v.optional(v.number()),
    liquidationBountyCapAbs: v.optional(v.int64()),
    fundingUpdatedAtSlot: v.optional(v.int64()),
    fundingRateBpsPerSlot: v.optional(v.int64()),
    indexedAt: v.number(),
  })
    .index("by_shard", ["shard"])
    .index("by_market", ["market"]),

  matcherAuthorityUpdates: defineTable({
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    authority: v.string(),
    oldMatcherAuthority: v.string(),
    newMatcherAuthority: v.string(),
    nowSlot: v.int64(),
    indexedAt: v.number(),
  })
    .index("by_signature", ["signature"])
    .index("by_market", ["market"]),

  matcherErrors: defineTable({
    kind: v.string(),
    message: v.string(),
    signer: v.optional(v.string()),
    oracleFeed: v.optional(v.string()),
    rpcUrl: v.optional(v.string()),
    indexedAt: v.number(),
  }).index("by_indexedAt", ["indexedAt"]),

  lpPools: defineTable({
    lpPool: v.string(),
    market: v.string(),
    shard: v.string(),
    collateralMint: v.string(),
    pooledEngineIndex: v.number(),
    lpFeeBps: v.number(),
    protocolFeeBps: v.number(),
    totalShares: v.int64(),
    accountingNav: v.int64(),
    cashNav: v.optional(v.int64()),
    estimatedNav: v.optional(v.int64()),
    totalDeposited: v.int64(),
    protocolFeeAccrued: v.int64(),
    pendingRedemptionShares: v.optional(v.int64()),
    pendingRedemptionValue: v.optional(v.int64()),
    createdAtSlot: v.int64(),
    indexedAt: v.number(),
  })
    .index("by_lp_pool", ["lpPool"])
    .index("by_market", ["market"])
    .index("by_shard", ["shard"]),

  lpPositions: defineTable({
    lpPool: v.string(),
    market: v.string(),
    shard: v.string(),
    owner: v.string(),
    lpPosition: v.string(),
    shares: v.int64(),
    lockedShares: v.optional(v.int64()),
    depositedTotal: v.int64(),
    pendingWithdrawShares: v.optional(v.int64()),
    pendingWithdrawAmount: v.optional(v.int64()),
    pendingWithdrawClaimableAtSlot: v.optional(v.int64()),
    indexedAt: v.number(),
  })
    .index("by_lp_position", ["lpPosition"])
    .index("by_lp_pool", ["lpPool"])
    .index("by_owner", ["owner"])
    .index("by_owner_market", ["owner", "market"]),

  lpRedemptions: defineTable({
    requestSignature: v.string(),
    market: v.string(),
    shard: v.string(),
    lpPool: v.string(),
    owner: v.string(),
    lpPosition: v.string(),
    requestedShares: v.int64(),
    estimatedAmount: v.int64(),
    claimableAtSlot: v.int64(),
    status: v.union(v.literal("pending"), v.literal("claimed")),
    requestSlot: v.int64(),
    claimSignature: v.optional(v.string()),
    claimSlot: v.optional(v.int64()),
    claimedAmount: v.optional(v.int64()),
    indexedAt: v.number(),
  })
    .index("by_request_signature", ["requestSignature"])
    .index("by_lp_position", ["lpPosition"])
    .index("by_owner", ["owner"])
    .index("by_owner_market", ["owner", "market"]),

  lpBandConfigs: defineTable({
    lpPool: v.string(),
    market: v.string(),
    shard: v.string(),
    owner: v.string(),
    lpBandConfig: v.string(),
    firstBandMaxNotional: v.int64(),
    firstBandMaxOracleDeviationBps: v.number(),
    firstBandSpreadBps: v.number(),
    firstBandMaxInventoryBps: v.number(),
    secondBandMaxNotional: v.int64(),
    secondBandMaxOracleDeviationBps: v.number(),
    secondBandSpreadBps: v.number(),
    secondBandMaxInventoryBps: v.number(),
    thirdBandMaxNotional: v.int64(),
    thirdBandMaxOracleDeviationBps: v.number(),
    thirdBandSpreadBps: v.number(),
    thirdBandMaxInventoryBps: v.number(),
    updatedAtSlot: v.int64(),
    indexedAt: v.number(),
  })
    .index("by_lp_band_config", ["lpBandConfig"])
    .index("by_lp_pool", ["lpPool"])
    .index("by_owner", ["owner"])
    .index("by_owner_market", ["owner", "market"]),

  traders: defineTable({
    market: v.string(),
    shard: v.string(),
    trader: v.string(),
    owner: v.string(),
    engineIndex: v.number(),
    collateralBalance: v.int64(),
    openedAtSlot: v.int64(),
    indexedAt: v.number(),
  })
    .index("by_trader", ["trader"])
    .index("by_owner", ["owner"])
    .index("by_owner_market", ["owner", "market"]),

  deposits: defineTable({
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    trader: v.string(),
    owner: v.string(),
    engineIndex: v.number(),
    amount: v.int64(),
    indexedAt: v.number(),
  })
    .index("by_signature", ["signature"])
    .index("by_trader", ["trader"])
    .index("by_owner", ["owner"]),

  cranks: defineTable({
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    nowSlot: v.int64(),
    lastCrankSlot: v.int64(),
    advanced: v.boolean(),
    indexedAt: v.number(),
  })
    .index("by_signature", ["signature"])
    .index("by_shard", ["shard"]),

  trades: defineTable({
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    trader: v.string(),
    owner: v.string(),
    sizeQ: v.int64(),
    execPrice: v.int64(),
    oraclePrice: v.int64(),
    effectiveSpreadBps: v.optional(v.number()),
    usedFallback: v.optional(v.boolean()),
    fallbackNotional: v.optional(v.int64()),
    nowSlot: v.int64(),
    oraclePostedSlot: v.int64(),
    indexedAt: v.number(),
  })
    .index("by_signature", ["signature"])
    .index("by_trader", ["trader"])
    .index("by_owner", ["owner"])
    .index("by_owner_market", ["owner", "market"])
    .index("by_shard_now_slot", ["shard", "nowSlot"]),

  positionsView: defineTable({
    market: v.string(),
    shard: v.string(),
    trader: v.string(),
    owner: v.string(),
    engineIndex: v.optional(v.number()),
    positionSizeQ: v.int64(),
    averageEntryPrice: v.optional(v.int64()),
    realizedPnl: v.optional(v.int64()),
    lastExecPrice: v.int64(),
    lastOraclePrice: v.int64(),
    lastUpdatedSlot: v.int64(),
    indexedAt: v.number(),
  })
    .index("by_trader", ["trader"])
    .index("by_owner", ["owner"])
    .index("by_owner_market", ["owner", "market"]),

  withdrawals: defineTable({
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
    indexedAt: v.number(),
  })
    .index("by_signature", ["signature"])
    .index("by_trader", ["trader"])
    .index("by_owner", ["owner"])
    .index("by_owner_market", ["owner", "market"]),

  housekeepingEvents: defineTable({
    eventKey: v.string(),
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    kind: v.union(
      v.literal("accountClosed"),
      v.literal("traderClosed"),
      v.literal("accountReclaimed"),
      v.literal("dustGarbageCollected"),
    ),
    owner: v.optional(v.string()),
    trader: v.optional(v.string()),
    engineIndex: v.optional(v.number()),
    amountReturned: v.optional(v.int64()),
    dustSwept: v.optional(v.int64()),
    numClosed: v.optional(v.number()),
    nowSlot: v.int64(),
    indexedAt: v.number(),
  })
    .index("by_event_key", ["eventKey"])
    .index("by_signature", ["signature"])
    .index("by_shard", ["shard"])
    .index("by_owner", ["owner"])
    .index("by_kind", ["kind"])
    .index("by_indexedAt", ["indexedAt"]),

  liquidations: defineTable({
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
    indexedAt: v.number(),
  })
    .index("by_signature", ["signature"])
    .index("by_owner", ["liquidateeOwner"])
    .index("by_owner_market", ["liquidateeOwner", "market"]),

  fundingUpdates: defineTable({
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    nowSlot: v.int64(),
    oldRateBpsPerSlot: v.int64(),
    newRateBpsPerSlot: v.int64(),
    intervalSlots: v.int64(),
    indexedAt: v.number(),
  })
    .index("by_signature", ["signature"])
    .index("by_shard", ["shard"])
    .index("by_market", ["market"]),

  fundingPayments: defineTable({
    signature: v.string(),
    slot: v.int64(),
    market: v.string(),
    shard: v.string(),
    trader: v.string(),
    owner: v.string(),
    engineIndex: v.number(),
    nowSlot: v.int64(),
    deltaFundingPnl: v.int64(),
    cumulativeFundingPnl: v.int64(),
    indexedAt: v.number(),
  })
    .index("by_signature", ["signature"])
    .index("by_owner", ["owner"])
    .index("by_owner_and_market_and_shard", ["owner", "market", "shard"])
    .index("by_owner_and_market_and_shard_and_nowSlot", [
      "owner",
      "market",
      "shard",
      "nowSlot",
    ])
    .index("by_shard", ["shard"]),

  quoteAnalytics: defineTable({
    market: v.string(),
    shard: v.string(),
    owner: v.optional(v.string()),
    side: v.union(v.literal("long"), v.literal("short")),
    requestedNotional: v.int64(),
    depthServedNotional: v.int64(),
    fallbackNotional: v.int64(),
    usedFallback: v.boolean(),
    oraclePrice: v.int64(),
    execPrice: v.int64(),
    indexedAt: v.number(),
  })
    .index("by_market", ["market"])
    .index("by_owner", ["owner"])
    .index("by_owner_market", ["owner", "market"]),
})


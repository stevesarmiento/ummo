"use node"

import { actionGeneric, makeFunctionReference } from "convex/server"
import { v } from "convex/values"

import {
  decodeBase64,
  extractProgramDataBase64,
  parseCrankEvent,
  parseDepositEvent,
  parseLiquidationEvent,
  parseLpBandConfiguredEvent,
  parseLpWithdrawalClaimedEvent,
  parseLpWithdrawalRequestedEvent,
  parseLpPoolInitializedEvent,
  parseLpPositionOpenedEvent,
  parseMarketInitializedEvent,
  parseMatcherAuthorityUpdatedEvent,
  parseShardInitializedEvent,
  parseTradeExecutedEvent,
  parseTraderOpenedEvent,
  parseWithdrawalEvent,
} from "./lib/quasar_events"

const upsertFromInitEvent = makeFunctionReference<"mutation">(
  "markets:upsertFromInitEvent",
)

const applyMatcherAuthorityUpdatedEvent = makeFunctionReference<"mutation">(
  "markets:applyMatcherAuthorityUpdatedEvent",
)

const upsertFromShardInitializedEvent = makeFunctionReference<"mutation">(
  "shards:upsertFromShardInitializedEvent",
)

const upsertFromOpenedEvent = makeFunctionReference<"mutation">(
  "traders:upsertFromOpenedEvent",
)

const upsertLpPoolFromInitializedEvent = makeFunctionReference<"mutation">(
  "lpPools:upsertFromInitializedEvent",
)

const applyLpDepositEvent = makeFunctionReference<"mutation">(
  "lpPools:applyLpDepositEvent",
)

const upsertLpPositionFromOpenedEvent = makeFunctionReference<"mutation">(
  "lpPositions:upsertFromOpenedEvent",
)

const upsertLpBandConfiguredEvent = makeFunctionReference<"mutation">(
  "lpBands:upsertFromConfiguredEvent",
)

const applyLpWithdrawalRequestedEvent = makeFunctionReference<"mutation">(
  "lpPositions:applyWithdrawalRequestedEvent",
)

const applyLpWithdrawalRequestedPoolEvent = makeFunctionReference<"mutation">(
  "lpPools:applyWithdrawalRequestedEvent",
)

const applyLpWithdrawalClaimedEvent = makeFunctionReference<"mutation">(
  "lpPositions:applyWithdrawalClaimedEvent",
)

const applyLpWithdrawalClaimedPoolEvent = makeFunctionReference<"mutation">(
  "lpPools:applyWithdrawalClaimedEvent",
)

const applyLpRedemptionRequestedEvent = makeFunctionReference<"mutation">(
  "lpRedemptions:applyRequestedEvent",
)

const applyLpRedemptionClaimedEvent = makeFunctionReference<"mutation">(
  "lpRedemptions:applyClaimedEvent",
)

const applyDepositEvent = makeFunctionReference<"mutation">(
  "traders:applyDepositEvent",
)

const applyCrankEvent = makeFunctionReference<"mutation">("cranks:applyCrankEvent")

const applyTradeExecutedEvent = makeFunctionReference<"mutation">(
  "trades:applyTradeExecutedEvent",
)

const applyWithdrawalEvent = makeFunctionReference<"mutation">(
  "withdrawals:applyWithdrawalEvent",
)

const applyLiquidationEvent = makeFunctionReference<"mutation">(
  "liquidations:applyLiquidationEvent",
)

async function getTransactionLogs(args: {
  rpcUrl: string
  signature: string
}): Promise<{ slot: bigint; logMessages: string[] }> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [
        args.signature,
        {
          encoding: "json",
          maxSupportedTransactionVersion: 0,
        },
      ],
    }

    const res = await fetch(args.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`RPC getTransaction failed (${res.status})`)

    const json = (await res.json()) as {
      result: { slot: number; meta?: { logMessages?: string[] | null } } | null
    }

    const result = json.result
    if (result) {
      const logMessages = result.meta?.logMessages?.filter(Boolean) ?? []
      return { slot: BigInt(result.slot), logMessages }
    }

    if (attempt < 5)
      await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)))
  }

  throw new Error("Transaction not found (getTransaction result=null)")
}

export const indexMarketInitialized = actionGeneric({
  args: {
    signature: v.string(),
    rpcUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rpcUrl =
      args.rpcUrl ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com"

    const { slot, logMessages } = await getTransactionLogs({
      rpcUrl,
      signature: args.signature,
    })

    for (const line of logMessages) {
      for (const base64 of extractProgramDataBase64(line)) {
        const bytes = decodeBase64(base64)
        const event = parseMarketInitializedEvent(bytes)
        if (!event) continue

        await ctx.runMutation(upsertFromInitEvent, {
          market: event.market,
          authority: event.authority,
          collateralMint: event.collateralMint,
          oracleFeed: event.oracleFeed,
          matcherAuthority: event.matcherAuthority,
          marketId: event.marketId,
          createdAtSlot: slot,
        })

        return { ...event, createdAtSlot: slot, signature: args.signature }
      }
    }

    throw new Error("No MarketInitialized event found in transaction logs")
  },
})

export const indexTransaction = actionGeneric({
  args: {
    signature: v.string(),
    rpcUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rpcUrl =
      args.rpcUrl ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com"

    const { slot, logMessages } = await getTransactionLogs({
      rpcUrl,
      signature: args.signature,
    })

    const indexed: Array<
      | { type: "MarketInitialized"; market: string; shard: string; marketId: bigint }
      | { type: "ShardInitialized"; market: string; shard: string; shardId: number }
      | { type: "MatcherAuthorityUpdated"; market: string; newMatcherAuthority: string }
      | { type: "LpPoolInitialized"; lpPool: string; shard: string }
      | { type: "LpPositionOpened"; lpPosition: string; owner: string; shares: bigint }
      | { type: "LpBandConfigured"; lpBandConfig: string; owner: string }
      | { type: "LpWithdrawalRequested"; lpPosition: string; owner: string; requestedShares: bigint }
      | { type: "LpWithdrawalClaimed"; lpPosition: string; owner: string; claimedAmount: bigint }
      | { type: "TraderOpened"; trader: string; owner: string; engineIndex: number }
      | { type: "Deposit"; trader: string; owner: string; amount: bigint; engineIndex: number }
      | { type: "Crank"; market: string; shard: string; lastCrankSlot: bigint; advanced: boolean }
      | {
          type: "TradeExecuted"
          trader: string
          owner: string
          sizeQ: bigint
          execPrice: bigint
        }
      | { type: "Withdrawal"; trader: string; owner: string; amount: bigint; engineIndex: number }
      | {
          type: "Liquidation"
          liquidateeOwner: string
          liquidated: boolean
          liquidateeEngineIndex: number
        }
    > = []

    for (const line of logMessages) {
      for (const base64 of extractProgramDataBase64(line)) {
        const bytes = decodeBase64(base64)

        const marketInit = parseMarketInitializedEvent(bytes)
        if (marketInit) {
          await ctx.runMutation(upsertFromInitEvent, {
            market: marketInit.market,
            authority: marketInit.authority,
            collateralMint: marketInit.collateralMint,
            oracleFeed: marketInit.oracleFeed,
            matcherAuthority: marketInit.matcherAuthority,
            marketId: marketInit.marketId,
            createdAtSlot: slot,
          })
          indexed.push({
            type: "MarketInitialized",
            market: marketInit.market,
            shard: marketInit.shard,
            marketId: marketInit.marketId,
          })
          continue
        }

        const shardInit = parseShardInitializedEvent(bytes)
        if (shardInit) {
          await ctx.runMutation(upsertFromShardInitializedEvent, {
            shard: shardInit.shard,
            market: shardInit.market,
            authority: shardInit.authority,
            shardSeed: shardInit.shardSeed,
            shardId: shardInit.shardId,
            houseEngineIndex: shardInit.houseEngineIndex,
            createdAtSlot: shardInit.createdAtSlot,
            lastCrankSlot: shardInit.lastCrankSlot,
          })
          indexed.push({
            type: "ShardInitialized",
            market: shardInit.market,
            shard: shardInit.shard,
            shardId: shardInit.shardId,
          })
          continue
        }

        const matcherUpdated = parseMatcherAuthorityUpdatedEvent(bytes)
        if (matcherUpdated) {
          await ctx.runMutation(applyMatcherAuthorityUpdatedEvent, {
            signature: args.signature,
            slot,
            market: matcherUpdated.market,
            authority: matcherUpdated.authority,
            oldMatcherAuthority: matcherUpdated.oldMatcherAuthority,
            newMatcherAuthority: matcherUpdated.newMatcherAuthority,
            nowSlot: matcherUpdated.nowSlot,
          })
          indexed.push({
            type: "MatcherAuthorityUpdated",
            market: matcherUpdated.market,
            newMatcherAuthority: matcherUpdated.newMatcherAuthority,
          })
          continue
        }

        const lpPoolInitialized = parseLpPoolInitializedEvent(bytes)
        if (lpPoolInitialized) {
          await ctx.runMutation(upsertLpPoolFromInitializedEvent, {
            ...lpPoolInitialized,
            createdAtSlot: lpPoolInitialized.createdAtSlot,
          })
          indexed.push({
            type: "LpPoolInitialized",
            lpPool: lpPoolInitialized.lpPool,
            shard: lpPoolInitialized.shard,
          })
          continue
        }

        const lpPositionOpened = parseLpPositionOpenedEvent(bytes)
        if (lpPositionOpened) {
          await ctx.runMutation(applyLpDepositEvent, {
            ...lpPositionOpened,
            shares: lpPositionOpened.shares,
            accountingNav: lpPositionOpened.accountingNav,
          })
          await ctx.runMutation(upsertLpPositionFromOpenedEvent, {
            depositedTotal: lpPositionOpened.accountingNav,
            lpPool: lpPositionOpened.lpPool,
            market: lpPositionOpened.market,
            shard: lpPositionOpened.shard,
            owner: lpPositionOpened.owner,
            lpPosition: lpPositionOpened.lpPosition,
            shares: lpPositionOpened.shares,
          })
          indexed.push({
            type: "LpPositionOpened",
            lpPosition: lpPositionOpened.lpPosition,
            owner: lpPositionOpened.owner,
            shares: lpPositionOpened.shares,
          })
          continue
        }

        const lpBandConfigured = parseLpBandConfiguredEvent(bytes)
        if (lpBandConfigured) {
          await ctx.runMutation(upsertLpBandConfiguredEvent, {
            ...lpBandConfigured,
            updatedAtSlot: lpBandConfigured.updatedAtSlot,
          })
          indexed.push({
            type: "LpBandConfigured",
            lpBandConfig: lpBandConfigured.lpBandConfig,
            owner: lpBandConfigured.owner,
          })
          continue
        }

        const lpWithdrawalRequested = parseLpWithdrawalRequestedEvent(bytes)
        if (lpWithdrawalRequested) {
          await ctx.runMutation(applyLpWithdrawalRequestedEvent, {
            lpPosition: lpWithdrawalRequested.lpPosition,
            requestedShares: lpWithdrawalRequested.requestedShares,
            estimatedAmount: lpWithdrawalRequested.estimatedAmount,
            claimableAtSlot: lpWithdrawalRequested.claimableAtSlot,
          })
          await ctx.runMutation(applyLpWithdrawalRequestedPoolEvent, {
            lpPool: lpWithdrawalRequested.lpPool,
            requestedShares: lpWithdrawalRequested.requestedShares,
            estimatedAmount: lpWithdrawalRequested.estimatedAmount,
          })
          await ctx.runMutation(applyLpRedemptionRequestedEvent, {
            requestSignature: args.signature,
            requestSlot: slot,
            market: lpWithdrawalRequested.market,
            shard: lpWithdrawalRequested.shard,
            lpPool: lpWithdrawalRequested.lpPool,
            owner: lpWithdrawalRequested.owner,
            lpPosition: lpWithdrawalRequested.lpPosition,
            requestedShares: lpWithdrawalRequested.requestedShares,
            estimatedAmount: lpWithdrawalRequested.estimatedAmount,
            claimableAtSlot: lpWithdrawalRequested.claimableAtSlot,
          })
          indexed.push({
            type: "LpWithdrawalRequested",
            lpPosition: lpWithdrawalRequested.lpPosition,
            owner: lpWithdrawalRequested.owner,
            requestedShares: lpWithdrawalRequested.requestedShares,
          })
          continue
        }

        const lpWithdrawalClaimed = parseLpWithdrawalClaimedEvent(bytes)
        if (lpWithdrawalClaimed) {
          await ctx.runMutation(applyLpWithdrawalClaimedEvent, {
            lpPosition: lpWithdrawalClaimed.lpPosition,
            burnedShares: lpWithdrawalClaimed.burnedShares,
            claimedAmount: lpWithdrawalClaimed.claimedAmount,
          })
          await ctx.runMutation(applyLpWithdrawalClaimedPoolEvent, {
            lpPool: lpWithdrawalClaimed.lpPool,
            burnedShares: lpWithdrawalClaimed.burnedShares,
            claimedAmount: lpWithdrawalClaimed.claimedAmount,
          })
          await ctx.runMutation(applyLpRedemptionClaimedEvent, {
            lpPosition: lpWithdrawalClaimed.lpPosition,
            owner: lpWithdrawalClaimed.owner,
            claimSignature: args.signature,
            claimSlot: slot,
            claimedAmount: lpWithdrawalClaimed.claimedAmount,
          })
          indexed.push({
            type: "LpWithdrawalClaimed",
            lpPosition: lpWithdrawalClaimed.lpPosition,
            owner: lpWithdrawalClaimed.owner,
            claimedAmount: lpWithdrawalClaimed.claimedAmount,
          })
          continue
        }

        const traderOpened = parseTraderOpenedEvent(bytes)
        if (traderOpened) {
          await ctx.runMutation(upsertFromOpenedEvent, {
            ...traderOpened,
            openedAtSlot: slot,
          })
          indexed.push({
            type: "TraderOpened",
            trader: traderOpened.trader,
            owner: traderOpened.owner,
            engineIndex: traderOpened.engineIndex,
          })
          continue
        }

        const deposit = parseDepositEvent(bytes)
        if (deposit) {
          await ctx.runMutation(applyDepositEvent, {
            signature: args.signature,
            slot,
            ...deposit,
          })
          indexed.push({
            type: "Deposit",
            trader: deposit.trader,
            owner: deposit.owner,
            amount: deposit.amount,
            engineIndex: deposit.engineIndex,
          })
          continue
        }

        const crank = parseCrankEvent(bytes)
        if (crank) {
          await ctx.runMutation(applyCrankEvent, {
            signature: args.signature,
            slot,
            market: crank.market,
            shard: crank.shard,
            nowSlot: crank.nowSlot,
            lastCrankSlot: crank.lastCrankSlot,
            advanced: crank.advanced,
          })
          indexed.push({
            type: "Crank",
            market: crank.market,
            shard: crank.shard,
            lastCrankSlot: crank.lastCrankSlot,
            advanced: crank.advanced,
          })
          continue
        }

        const trade = parseTradeExecutedEvent(bytes)
        if (trade) {
          await ctx.runMutation(applyTradeExecutedEvent, {
            signature: args.signature,
            slot,
            market: trade.market,
            shard: trade.shard,
            trader: trade.trader,
            owner: trade.owner,
            sizeQ: trade.sizeQ,
            execPrice: trade.execPrice,
            oraclePrice: trade.oraclePrice,
            nowSlot: trade.nowSlot,
            oraclePostedSlot: trade.oraclePostedSlot,
          })
          indexed.push({
            type: "TradeExecuted",
            trader: trade.trader,
            owner: trade.owner,
            sizeQ: trade.sizeQ,
            execPrice: trade.execPrice,
          })
          continue
        }

        const withdrawal = parseWithdrawalEvent(bytes)
        if (withdrawal) {
          await ctx.runMutation(applyWithdrawalEvent, {
            signature: args.signature,
            slot,
            market: withdrawal.market,
            shard: withdrawal.shard,
            trader: withdrawal.trader,
            owner: withdrawal.owner,
            engineIndex: withdrawal.engineIndex,
            amount: withdrawal.amount,
            nowSlot: withdrawal.nowSlot,
            oraclePrice: withdrawal.oraclePrice,
            oraclePostedSlot: withdrawal.oraclePostedSlot,
          })
          indexed.push({
            type: "Withdrawal",
            trader: withdrawal.trader,
            owner: withdrawal.owner,
            amount: withdrawal.amount,
            engineIndex: withdrawal.engineIndex,
          })
          continue
        }

        const liquidation = parseLiquidationEvent(bytes)
        if (liquidation) {
          await ctx.runMutation(applyLiquidationEvent, {
            signature: args.signature,
            slot,
            market: liquidation.market,
            shard: liquidation.shard,
            keeper: liquidation.keeper,
            liquidateeOwner: liquidation.liquidateeOwner,
            liquidateeEngineIndex: liquidation.liquidateeEngineIndex,
            liquidated: liquidation.liquidated,
            oldEffectivePosQ: liquidation.oldEffectivePosQ,
            nowSlot: liquidation.nowSlot,
            oraclePrice: liquidation.oraclePrice,
            oraclePostedSlot: liquidation.oraclePostedSlot,
          })
          indexed.push({
            type: "Liquidation",
            liquidateeOwner: liquidation.liquidateeOwner,
            liquidated: liquidation.liquidated,
            liquidateeEngineIndex: liquidation.liquidateeEngineIndex,
          })
          continue
        }
      }
    }

    if (!indexed.length) throw new Error("No known protocol event found in transaction logs")
    return { signature: args.signature, slot, indexed }
  },
})


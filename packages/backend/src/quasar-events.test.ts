import { describe, expect, test } from "bun:test"
import bs58 from "bs58"

import {
  decodeBase64,
  extractProgramDataBase64,
  parseCrankEvent,
  parseDepositEvent,
  parseLiquidationEvent,
  parseMarketInitializedEvent,
  parseMatcherAuthorityUpdatedEvent,
  parseShardInitializedEvent,
  parseTradeExecutedEvent,
  parseTraderOpenedEvent,
  parseWithdrawalEvent,
} from "../convex/lib/quasar_events"

function u64LeBytes(value: bigint): Uint8Array {
  const out = new Uint8Array(8)
  let v = value
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}

function i64LeBytes(value: bigint): Uint8Array {
  const out = new Uint8Array(8)
  let v = BigInt.asUintN(64, BigInt.asIntN(64, value))
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}

describe("quasar event parsing", () => {
  test("parses MarketInitialized from Program data log", () => {
    const marketBytes = new Uint8Array(32).fill(1)
    const shardBytes = new Uint8Array(32).fill(2)
    const authorityBytes = new Uint8Array(32).fill(3)
    const collateralMintBytes = new Uint8Array(32).fill(4)
    const oracleFeedBytes = new Uint8Array(32).fill(5)
    const matcherAuthorityBytes = new Uint8Array(32).fill(6)
    const marketId = 42n

    const bytes = new Uint8Array(1 + 32 * 6 + 8)
    bytes[0] = 0
    bytes.set(marketBytes, 1)
    bytes.set(shardBytes, 33)
    bytes.set(authorityBytes, 65)
    bytes.set(collateralMintBytes, 97)
    bytes.set(oracleFeedBytes, 129)
    bytes.set(matcherAuthorityBytes, 161)
    bytes.set(u64LeBytes(marketId), 193)

    const base64 = Buffer.from(bytes).toString("base64")
    const [foundBase64] = extractProgramDataBase64(`Program data: ${base64}`)
    expect(foundBase64).toBe(base64)

    const decoded = decodeBase64(base64)
    const event = parseMarketInitializedEvent(decoded)
    expect(event).not.toBeNull()
    if (!event) return

    expect(event.market).toBe(bs58.encode(marketBytes))
    expect(event.shard).toBe(bs58.encode(shardBytes))
    expect(event.authority).toBe(bs58.encode(authorityBytes))
    expect(event.collateralMint).toBe(bs58.encode(collateralMintBytes))
    expect(event.oracleFeed).toBe(bs58.encode(oracleFeedBytes))
    expect(event.matcherAuthority).toBe(bs58.encode(matcherAuthorityBytes))
    expect(event.marketId).toBe(marketId)
  })

  test("parses ShardInitialized from Program data log", () => {
    const marketBytes = new Uint8Array(32).fill(1)
    const shardBytes = new Uint8Array(32).fill(2)
    const authorityBytes = new Uint8Array(32).fill(3)
    const shardSeedBytes = new Uint8Array(32).fill(4)
    const shardId = 1
    const houseEngineIndex = 9
    const createdAtSlot = 123n
    const lastCrankSlot = 123n

    const bytes = new Uint8Array(1 + 32 * 4 + 2 + 2 + 4 + 8 + 8)
    bytes[0] = 7
    bytes.set(marketBytes, 1)
    bytes.set(shardBytes, 33)
    bytes.set(authorityBytes, 65)
    bytes.set(shardSeedBytes, 97)
    bytes[129] = shardId & 0xff
    bytes[130] = (shardId >> 8) & 0xff
    bytes[131] = houseEngineIndex & 0xff
    bytes[132] = (houseEngineIndex >> 8) & 0xff
    // pad0 bytes [133..137] left as zeros
    bytes.set(u64LeBytes(createdAtSlot), 137)
    bytes.set(u64LeBytes(lastCrankSlot), 145)

    const base64 = Buffer.from(bytes).toString("base64")
    const decoded = decodeBase64(base64)
    const event = parseShardInitializedEvent(decoded)
    expect(event).not.toBeNull()
    if (!event) return

    expect(event.market).toBe(bs58.encode(marketBytes))
    expect(event.shard).toBe(bs58.encode(shardBytes))
    expect(event.authority).toBe(bs58.encode(authorityBytes))
    expect(event.shardSeed).toBe(bs58.encode(shardSeedBytes))
    expect(event.shardId).toBe(shardId)
    expect(event.houseEngineIndex).toBe(houseEngineIndex)
    expect(event.createdAtSlot).toBe(createdAtSlot)
    expect(event.lastCrankSlot).toBe(lastCrankSlot)
  })

  test("parses MatcherAuthorityUpdated from Program data log", () => {
    const marketBytes = new Uint8Array(32).fill(1)
    const authorityBytes = new Uint8Array(32).fill(2)
    const oldMatcherBytes = new Uint8Array(32).fill(3)
    const newMatcherBytes = new Uint8Array(32).fill(4)
    const nowSlot = 999n

    const bytes = new Uint8Array(1 + 32 * 4 + 8)
    bytes[0] = 8
    bytes.set(marketBytes, 1)
    bytes.set(authorityBytes, 33)
    bytes.set(oldMatcherBytes, 65)
    bytes.set(newMatcherBytes, 97)
    bytes.set(u64LeBytes(nowSlot), 129)

    const base64 = Buffer.from(bytes).toString("base64")
    const decoded = decodeBase64(base64)
    const event = parseMatcherAuthorityUpdatedEvent(decoded)
    expect(event).not.toBeNull()
    if (!event) return

    expect(event.market).toBe(bs58.encode(marketBytes))
    expect(event.authority).toBe(bs58.encode(authorityBytes))
    expect(event.oldMatcherAuthority).toBe(bs58.encode(oldMatcherBytes))
    expect(event.newMatcherAuthority).toBe(bs58.encode(newMatcherBytes))
    expect(event.nowSlot).toBe(nowSlot)
  })

  test("parses TraderOpened from Program data log", () => {
    const marketBytes = new Uint8Array(32).fill(1)
    const shardBytes = new Uint8Array(32).fill(2)
    const traderBytes = new Uint8Array(32).fill(3)
    const ownerBytes = new Uint8Array(32).fill(4)
    const engineIndex = 513

    const bytes = new Uint8Array(1 + 32 * 4 + 2)
    bytes[0] = 1
    bytes.set(marketBytes, 1)
    bytes.set(shardBytes, 33)
    bytes.set(traderBytes, 65)
    bytes.set(ownerBytes, 97)
    bytes[129] = engineIndex & 0xff
    bytes[130] = (engineIndex >> 8) & 0xff

    const base64 = Buffer.from(bytes).toString("base64")
    const decoded = decodeBase64(base64)
    const event = parseTraderOpenedEvent(decoded)
    expect(event).not.toBeNull()
    if (!event) return

    expect(event.market).toBe(bs58.encode(marketBytes))
    expect(event.shard).toBe(bs58.encode(shardBytes))
    expect(event.trader).toBe(bs58.encode(traderBytes))
    expect(event.owner).toBe(bs58.encode(ownerBytes))
    expect(event.engineIndex).toBe(engineIndex)
  })

  test("parses Deposit from Program data log", () => {
    const marketBytes = new Uint8Array(32).fill(1)
    const shardBytes = new Uint8Array(32).fill(2)
    const traderBytes = new Uint8Array(32).fill(3)
    const ownerBytes = new Uint8Array(32).fill(4)
    const amount = 123_456_789n
    const engineIndex = 42

    const bytes = new Uint8Array(1 + 32 * 4 + 8 + 2 + 2 + 4)
    bytes[0] = 2
    bytes.set(marketBytes, 1)
    bytes.set(shardBytes, 33)
    bytes.set(traderBytes, 65)
    bytes.set(ownerBytes, 97)
    bytes.set(u64LeBytes(amount), 129)
    bytes[137] = engineIndex & 0xff
    bytes[138] = (engineIndex >> 8) & 0xff
    // reserved bytes left as zeros

    const base64 = Buffer.from(bytes).toString("base64")
    const decoded = decodeBase64(base64)
    const event = parseDepositEvent(decoded)
    expect(event).not.toBeNull()
    if (!event) return

    expect(event.market).toBe(bs58.encode(marketBytes))
    expect(event.shard).toBe(bs58.encode(shardBytes))
    expect(event.trader).toBe(bs58.encode(traderBytes))
    expect(event.owner).toBe(bs58.encode(ownerBytes))
    expect(event.amount).toBe(amount)
    expect(event.engineIndex).toBe(engineIndex)
  })

  test("parses CrankEvent from Program data log", () => {
    const marketBytes = new Uint8Array(32).fill(1)
    const shardBytes = new Uint8Array(32).fill(2)
    const nowSlot = 1234n
    const lastCrankSlot = 1200n

    const bytes = new Uint8Array(1 + 32 * 2 + 8 + 8 + 1 + 7)
    bytes[0] = 3
    bytes.set(marketBytes, 1)
    bytes.set(shardBytes, 33)
    bytes.set(u64LeBytes(nowSlot), 65)
    bytes.set(u64LeBytes(lastCrankSlot), 73)
    bytes[81] = 1

    const base64 = Buffer.from(bytes).toString("base64")
    const decoded = decodeBase64(base64)
    const event = parseCrankEvent(decoded)
    expect(event).not.toBeNull()
    if (!event) return

    expect(event.market).toBe(bs58.encode(marketBytes))
    expect(event.shard).toBe(bs58.encode(shardBytes))
    expect(event.nowSlot).toBe(nowSlot)
    expect(event.lastCrankSlot).toBe(lastCrankSlot)
    expect(event.advanced).toBe(true)
  })

  test("parses TradeExecuted from Program data log", () => {
    const marketBytes = new Uint8Array(32).fill(1)
    const shardBytes = new Uint8Array(32).fill(2)
    const traderBytes = new Uint8Array(32).fill(3)
    const ownerBytes = new Uint8Array(32).fill(4)
    const sizeQ = -123_000_000n
    const execPrice = 200_123_456n
    const oraclePrice = 200_123_456n
    const nowSlot = 5555n
    const oraclePostedSlot = 5550n

    const bytes = new Uint8Array(1 + 32 * 4 + 8 * 5)
    bytes[0] = 4
    bytes.set(marketBytes, 1)
    bytes.set(shardBytes, 33)
    bytes.set(traderBytes, 65)
    bytes.set(ownerBytes, 97)
    bytes.set(i64LeBytes(sizeQ), 129)
    bytes.set(u64LeBytes(execPrice), 137)
    bytes.set(u64LeBytes(oraclePrice), 145)
    bytes.set(u64LeBytes(nowSlot), 153)
    bytes.set(u64LeBytes(oraclePostedSlot), 161)

    const base64 = Buffer.from(bytes).toString("base64")
    const decoded = decodeBase64(base64)
    const event = parseTradeExecutedEvent(decoded)
    expect(event).not.toBeNull()
    if (!event) return

    expect(event.market).toBe(bs58.encode(marketBytes))
    expect(event.shard).toBe(bs58.encode(shardBytes))
    expect(event.trader).toBe(bs58.encode(traderBytes))
    expect(event.owner).toBe(bs58.encode(ownerBytes))
    expect(event.sizeQ).toBe(sizeQ)
    expect(event.execPrice).toBe(execPrice)
    expect(event.oraclePrice).toBe(oraclePrice)
    expect(event.nowSlot).toBe(nowSlot)
    expect(event.oraclePostedSlot).toBe(oraclePostedSlot)
  })

  test("parses WithdrawalEvent from Program data log", () => {
    const marketBytes = new Uint8Array(32).fill(1)
    const shardBytes = new Uint8Array(32).fill(2)
    const traderBytes = new Uint8Array(32).fill(3)
    const ownerBytes = new Uint8Array(32).fill(4)
    const amount = 50_000_000n
    const engineIndex = 42
    const nowSlot = 7777n
    const oraclePrice = 200_000_000n
    const oraclePostedSlot = 7770n

    const bytes = new Uint8Array(1 + 32 * 4 + 8 + 2 + 2 + 4 + 8 + 8 + 8)
    bytes[0] = 5
    bytes.set(marketBytes, 1)
    bytes.set(shardBytes, 33)
    bytes.set(traderBytes, 65)
    bytes.set(ownerBytes, 97)
    bytes.set(u64LeBytes(amount), 129)
    bytes[137] = engineIndex & 0xff
    bytes[138] = (engineIndex >> 8) & 0xff
    // reserved bytes [139..145] left as zeros
    bytes.set(u64LeBytes(nowSlot), 145)
    bytes.set(u64LeBytes(oraclePrice), 153)
    bytes.set(u64LeBytes(oraclePostedSlot), 161)

    const base64 = Buffer.from(bytes).toString("base64")
    const decoded = decodeBase64(base64)
    const event = parseWithdrawalEvent(decoded)
    expect(event).not.toBeNull()
    if (!event) return

    expect(event.market).toBe(bs58.encode(marketBytes))
    expect(event.shard).toBe(bs58.encode(shardBytes))
    expect(event.trader).toBe(bs58.encode(traderBytes))
    expect(event.owner).toBe(bs58.encode(ownerBytes))
    expect(event.amount).toBe(amount)
    expect(event.engineIndex).toBe(engineIndex)
    expect(event.nowSlot).toBe(nowSlot)
    expect(event.oraclePrice).toBe(oraclePrice)
    expect(event.oraclePostedSlot).toBe(oraclePostedSlot)
  })

  test("parses LiquidationEvent from Program data log", () => {
    const marketBytes = new Uint8Array(32).fill(1)
    const shardBytes = new Uint8Array(32).fill(2)
    const keeperBytes = new Uint8Array(32).fill(3)
    const liquidateeOwnerBytes = new Uint8Array(32).fill(4)
    const liquidateeEngineIndex = 7
    const liquidated = true
    const oldEffectivePosQ = -1_500_000n
    const nowSlot = 8888n
    const oraclePrice = 199_000_000n
    const oraclePostedSlot = 8880n

    const bytes = new Uint8Array(1 + 32 * 4 + 2 + 1 + 1 + 4 + 8 + 8 + 8 + 8)
    bytes[0] = 6
    bytes.set(marketBytes, 1)
    bytes.set(shardBytes, 33)
    bytes.set(keeperBytes, 65)
    bytes.set(liquidateeOwnerBytes, 97)
    bytes[129] = liquidateeEngineIndex & 0xff
    bytes[130] = (liquidateeEngineIndex >> 8) & 0xff
    bytes[131] = liquidated ? 1 : 0
    // bytes[132] pad0
    // bytes[133..137] pad1 left as zeros
    bytes.set(i64LeBytes(oldEffectivePosQ), 137)
    bytes.set(u64LeBytes(nowSlot), 145)
    bytes.set(u64LeBytes(oraclePrice), 153)
    bytes.set(u64LeBytes(oraclePostedSlot), 161)

    const base64 = Buffer.from(bytes).toString("base64")
    const decoded = decodeBase64(base64)
    const event = parseLiquidationEvent(decoded)
    expect(event).not.toBeNull()
    if (!event) return

    expect(event.market).toBe(bs58.encode(marketBytes))
    expect(event.shard).toBe(bs58.encode(shardBytes))
    expect(event.keeper).toBe(bs58.encode(keeperBytes))
    expect(event.liquidateeOwner).toBe(bs58.encode(liquidateeOwnerBytes))
    expect(event.liquidateeEngineIndex).toBe(liquidateeEngineIndex)
    expect(event.liquidated).toBe(liquidated)
    expect(event.oldEffectivePosQ).toBe(oldEffectivePosQ)
    expect(event.nowSlot).toBe(nowSlot)
    expect(event.oraclePrice).toBe(oraclePrice)
    expect(event.oraclePostedSlot).toBe(oraclePostedSlot)
  })
})


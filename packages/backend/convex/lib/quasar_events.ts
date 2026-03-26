"use node"

import { createHash } from "node:crypto"
import bs58 from "bs58"

export interface MarketInitializedEvent {
  market: string
  shard: string
  authority: string
  collateralMint: string
  oracleFeed: string
  matcherAuthority: string
  marketId: bigint
}

export interface ShardInitializedEvent {
  market: string
  shard: string
  authority: string
  shardSeed: string
  shardId: number
  houseEngineIndex: number
  createdAtSlot: bigint
  lastCrankSlot: bigint
}

export interface TraderOpenedEvent {
  market: string
  shard: string
  trader: string
  owner: string
  engineIndex: number
}

export interface DepositEvent {
  market: string
  shard: string
  trader: string
  owner: string
  amount: bigint
  engineIndex: number
}

export interface CrankEvent {
  market: string
  shard: string
  nowSlot: bigint
  lastCrankSlot: bigint
  advanced: boolean
}

export interface TradeExecutedEvent {
  market: string
  shard: string
  trader: string
  owner: string
  sizeQ: bigint
  execPrice: bigint
  oraclePrice: bigint
  nowSlot: bigint
  oraclePostedSlot: bigint
}

export interface WithdrawalEvent {
  market: string
  shard: string
  trader: string
  owner: string
  amount: bigint
  engineIndex: number
  nowSlot: bigint
  oraclePrice: bigint
  oraclePostedSlot: bigint
}

export interface LiquidationEvent {
  market: string
  shard: string
  keeper: string
  liquidateeOwner: string
  liquidateeEngineIndex: number
  liquidated: boolean
  oldEffectivePosQ: bigint
  nowSlot: bigint
  oraclePrice: bigint
  oraclePostedSlot: bigint
}

export interface MatcherAuthorityUpdatedEvent {
  market: string
  authority: string
  oldMatcherAuthority: string
  newMatcherAuthority: string
  nowSlot: bigint
}

export interface LpPoolInitializedEvent {
  market: string
  shard: string
  lpPool: string
  collateralMint: string
  pooledEngineIndex: number
  lpFeeBps: number
  protocolFeeBps: number
  createdAtSlot: bigint
}

export interface LpPositionOpenedEvent {
  market: string
  shard: string
  lpPool: string
  owner: string
  lpPosition: string
  shares: bigint
  accountingNav: bigint
}

export interface LpBandConfiguredEvent {
  market: string
  shard: string
  lpPool: string
  owner: string
  lpBandConfig: string
  firstBandMaxNotional: bigint
  firstBandMaxOracleDeviationBps: number
  firstBandSpreadBps: number
  firstBandMaxInventoryBps: number
  secondBandMaxNotional: bigint
  secondBandMaxOracleDeviationBps: number
  secondBandSpreadBps: number
  secondBandMaxInventoryBps: number
  thirdBandMaxNotional: bigint
  thirdBandMaxOracleDeviationBps: number
  thirdBandSpreadBps: number
  thirdBandMaxInventoryBps: number
  updatedAtSlot: bigint
}

export const MARKET_INITIALIZED_DISCRIMINATOR = 0
export const MARKET_INITIALIZED_BYTES_LEN = 1 + 32 * 6 + 8

export const SHARD_INITIALIZED_DISCRIMINATOR = 7
export const SHARD_INITIALIZED_BYTES_LEN = 1 + 32 * 4 + 2 + 2 + 4 + 8 + 8

export const MATCHER_AUTHORITY_UPDATED_DISCRIMINATOR = 8
export const MATCHER_AUTHORITY_UPDATED_BYTES_LEN = 1 + 32 * 4 + 8

export const TRADER_OPENED_DISCRIMINATOR = 1
export const TRADER_OPENED_BYTES_LEN = 1 + 32 * 4 + 2

export const DEPOSIT_DISCRIMINATOR = 2
export const DEPOSIT_BYTES_LEN = 1 + 32 * 4 + 8 + 2 + 2 + 4

export const CRANK_DISCRIMINATOR = 3
export const CRANK_BYTES_LEN = 1 + 32 * 2 + 8 + 8 + 1 + 7

export const TRADE_EXECUTED_DISCRIMINATOR = 4
export const TRADE_EXECUTED_BYTES_LEN = 1 + 32 * 4 + 8 * 5

export const WITHDRAWAL_DISCRIMINATOR = 5
export const WITHDRAWAL_BYTES_LEN = 1 + 32 * 4 + 8 + 2 + 2 + 4 + 8 + 8 + 8

export const LIQUIDATION_DISCRIMINATOR = 6
export const LIQUIDATION_BYTES_LEN = 1 + 32 * 4 + 2 + 1 + 1 + 4 + 8 + 8 + 8 + 8

const ANCHOR_MARKET_INITIALIZED_DISCRIMINATOR = createHash("sha256")
  .update("event:MarketInitialized")
  .digest()
  .subarray(0, 8)
const ANCHOR_MARKET_INITIALIZED_BYTES_LEN = 8 + 32 * 6 + 8

const ANCHOR_SHARD_INITIALIZED_DISCRIMINATOR = createHash("sha256")
  .update("event:ShardInitialized")
  .digest()
  .subarray(0, 8)
const ANCHOR_SHARD_INITIALIZED_BYTES_LEN = 8 + 32 * 4 + 2 + 2 + 8 + 8

const ANCHOR_MATCHER_AUTHORITY_UPDATED_DISCRIMINATOR = createHash("sha256")
  .update("event:MatcherAuthorityUpdated")
  .digest()
  .subarray(0, 8)
const ANCHOR_MATCHER_AUTHORITY_UPDATED_BYTES_LEN = 8 + 32 * 4 + 8

const ANCHOR_TRADER_OPENED_DISCRIMINATOR = createHash("sha256")
  .update("event:TraderOpened")
  .digest()
  .subarray(0, 8)
const ANCHOR_TRADER_OPENED_BYTES_LEN = 8 + 32 * 4 + 2

const ANCHOR_DEPOSIT_EVENT_DISCRIMINATOR = createHash("sha256")
  .update("event:DepositEvent")
  .digest()
  .subarray(0, 8)
const ANCHOR_DEPOSIT_EVENT_BYTES_LEN = 8 + 32 * 4 + 8 + 2 + 2 + 4

const ANCHOR_TRADE_EXECUTED_DISCRIMINATOR = createHash("sha256")
  .update("event:TradeExecuted")
  .digest()
  .subarray(0, 8)
const ANCHOR_TRADE_EXECUTED_BYTES_LEN = 8 + 32 * 4 + 8 * 5

const ANCHOR_LP_POOL_INITIALIZED_DISCRIMINATOR = createHash("sha256")
  .update("event:LpPoolInitialized")
  .digest()
  .subarray(0, 8)
const ANCHOR_LP_POOL_INITIALIZED_BYTES_LEN = 8 + 32 * 4 + 2 + 2 + 2 + 8

const ANCHOR_LP_POSITION_OPENED_DISCRIMINATOR = createHash("sha256")
  .update("event:LpPositionOpened")
  .digest()
  .subarray(0, 8)
const ANCHOR_LP_POSITION_OPENED_BYTES_LEN = 8 + 32 * 5 + 8 + 8

const ANCHOR_LP_BAND_CONFIGURED_DISCRIMINATOR = createHash("sha256")
  .update("event:LpBandConfigured")
  .digest()
  .subarray(0, 8)
const ANCHOR_LP_BAND_CONFIGURED_BYTES_LEN =
  8 + 32 * 5 + (8 + 2 + 2 + 2) * 3 + 8

function hasPrefix(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix[i]) return false
  }
  return true
}

export function readU64LE(bytes: Uint8Array): bigint {
  let value = 0n
  for (let i = 0; i < 8; i++) value |= BigInt(bytes[i] ?? 0) << (8n * BigInt(i))
  return value
}

export function readI64LE(bytes: Uint8Array): bigint {
  return BigInt.asIntN(64, readU64LE(bytes))
}

export function readU32LE(bytes: Uint8Array): number {
  return (
    (bytes[0] ?? 0) |
    ((bytes[1] ?? 0) << 8) |
    ((bytes[2] ?? 0) << 16) |
    ((bytes[3] ?? 0) << 24)
  ) >>> 0
}

export function readU16LE(bytes: Uint8Array): number {
  return (bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8)
}

export function decodeBase64(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"))
}

export function extractProgramDataBase64(logLine: string): string[] {
  const prefix = "Program data: "
  if (!logLine.startsWith(prefix)) return []

  const rest = logLine.slice(prefix.length).trim()
  if (!rest) return []

  return rest.split(/\s+/)
}

export function parseMarketInitializedEvent(
  bytes: Uint8Array,
): MarketInitializedEvent | null {
  if (bytes.length === MARKET_INITIALIZED_BYTES_LEN && bytes[0] === MARKET_INITIALIZED_DISCRIMINATOR) {
    const market = bs58.encode(bytes.slice(1, 33))
    const shard = bs58.encode(bytes.slice(33, 65))
    const authority = bs58.encode(bytes.slice(65, 97))
    const collateralMint = bs58.encode(bytes.slice(97, 129))
    const oracleFeed = bs58.encode(bytes.slice(129, 161))
    const matcherAuthority = bs58.encode(bytes.slice(161, 193))
    const marketId = readU64LE(bytes.slice(193, 201))

    return { market, shard, authority, collateralMint, oracleFeed, matcherAuthority, marketId }
  }

  if (
    bytes.length !== ANCHOR_MARKET_INITIALIZED_BYTES_LEN ||
    !hasPrefix(bytes, ANCHOR_MARKET_INITIALIZED_DISCRIMINATOR)
  )
    return null

  const market = bs58.encode(bytes.slice(8, 40))
  const shard = bs58.encode(bytes.slice(40, 72))
  const authority = bs58.encode(bytes.slice(72, 104))
  const collateralMint = bs58.encode(bytes.slice(104, 136))
  const oracleFeed = bs58.encode(bytes.slice(136, 168))
  const matcherAuthority = bs58.encode(bytes.slice(168, 200))
  const marketId = readU64LE(bytes.slice(200, 208))

  return { market, shard, authority, collateralMint, oracleFeed, matcherAuthority, marketId }
}

export function parseShardInitializedEvent(
  bytes: Uint8Array,
): ShardInitializedEvent | null {
  if (bytes.length === SHARD_INITIALIZED_BYTES_LEN && bytes[0] === SHARD_INITIALIZED_DISCRIMINATOR) {
    const market = bs58.encode(bytes.slice(1, 33))
    const shard = bs58.encode(bytes.slice(33, 65))
    const authority = bs58.encode(bytes.slice(65, 97))
    const shardSeed = bs58.encode(bytes.slice(97, 129))
    const shardId = readU16LE(bytes.slice(129, 131))
    const houseEngineIndex = readU16LE(bytes.slice(131, 133))
    const createdAtSlot = readU64LE(bytes.slice(137, 145))
    const lastCrankSlot = readU64LE(bytes.slice(145, 153))

    return {
      market,
      shard,
      authority,
      shardSeed,
      shardId,
      houseEngineIndex,
      createdAtSlot,
      lastCrankSlot,
    }
  }

  if (
    bytes.length !== ANCHOR_SHARD_INITIALIZED_BYTES_LEN ||
    !hasPrefix(bytes, ANCHOR_SHARD_INITIALIZED_DISCRIMINATOR)
  )
    return null

  const market = bs58.encode(bytes.slice(8, 40))
  const shard = bs58.encode(bytes.slice(40, 72))
  const authority = bs58.encode(bytes.slice(72, 104))
  const shardSeed = bs58.encode(bytes.slice(104, 136))
  const shardId = readU16LE(bytes.slice(136, 138))
  const houseEngineIndex = readU16LE(bytes.slice(138, 140))
  const createdAtSlot = readU64LE(bytes.slice(140, 148))
  const lastCrankSlot = readU64LE(bytes.slice(148, 156))

  return {
    market,
    shard,
    authority,
    shardSeed,
    shardId,
    houseEngineIndex,
    createdAtSlot,
    lastCrankSlot,
  }
}

export function parseMatcherAuthorityUpdatedEvent(
  bytes: Uint8Array,
): MatcherAuthorityUpdatedEvent | null {
  if (
    bytes.length === MATCHER_AUTHORITY_UPDATED_BYTES_LEN &&
    bytes[0] === MATCHER_AUTHORITY_UPDATED_DISCRIMINATOR
  ) {
    const market = bs58.encode(bytes.slice(1, 33))
    const authority = bs58.encode(bytes.slice(33, 65))
    const oldMatcherAuthority = bs58.encode(bytes.slice(65, 97))
    const newMatcherAuthority = bs58.encode(bytes.slice(97, 129))
    const nowSlot = readU64LE(bytes.slice(129, 137))

    return { market, authority, oldMatcherAuthority, newMatcherAuthority, nowSlot }
  }

  if (
    bytes.length !== ANCHOR_MATCHER_AUTHORITY_UPDATED_BYTES_LEN ||
    !hasPrefix(bytes, ANCHOR_MATCHER_AUTHORITY_UPDATED_DISCRIMINATOR)
  )
    return null

  const market = bs58.encode(bytes.slice(8, 40))
  const authority = bs58.encode(bytes.slice(40, 72))
  const oldMatcherAuthority = bs58.encode(bytes.slice(72, 104))
  const newMatcherAuthority = bs58.encode(bytes.slice(104, 136))
  const nowSlot = readU64LE(bytes.slice(136, 144))

  return { market, authority, oldMatcherAuthority, newMatcherAuthority, nowSlot }
}

export function parseTraderOpenedEvent(bytes: Uint8Array): TraderOpenedEvent | null {
  if (bytes.length === TRADER_OPENED_BYTES_LEN && bytes[0] === TRADER_OPENED_DISCRIMINATOR) {
    const market = bs58.encode(bytes.slice(1, 33))
    const shard = bs58.encode(bytes.slice(33, 65))
    const trader = bs58.encode(bytes.slice(65, 97))
    const owner = bs58.encode(bytes.slice(97, 129))
    const engineIndex = readU16LE(bytes.slice(129, 131))

    return { market, shard, trader, owner, engineIndex }
  }

  if (
    bytes.length !== ANCHOR_TRADER_OPENED_BYTES_LEN ||
    !hasPrefix(bytes, ANCHOR_TRADER_OPENED_DISCRIMINATOR)
  )
    return null

  const market = bs58.encode(bytes.slice(8, 40))
  const shard = bs58.encode(bytes.slice(40, 72))
  const trader = bs58.encode(bytes.slice(72, 104))
  const owner = bs58.encode(bytes.slice(104, 136))
  const engineIndex = readU16LE(bytes.slice(136, 138))

  return { market, shard, trader, owner, engineIndex }
}

export function parseLpPoolInitializedEvent(
  bytes: Uint8Array,
): LpPoolInitializedEvent | null {
  if (
    bytes.length !== ANCHOR_LP_POOL_INITIALIZED_BYTES_LEN ||
    !hasPrefix(bytes, ANCHOR_LP_POOL_INITIALIZED_DISCRIMINATOR)
  )
    return null

  const market = bs58.encode(bytes.slice(8, 40))
  const shard = bs58.encode(bytes.slice(40, 72))
  const lpPool = bs58.encode(bytes.slice(72, 104))
  const collateralMint = bs58.encode(bytes.slice(104, 136))
  const pooledEngineIndex = readU16LE(bytes.slice(136, 138))
  const lpFeeBps = readU16LE(bytes.slice(138, 140))
  const protocolFeeBps = readU16LE(bytes.slice(140, 142))
  const createdAtSlot = readU64LE(bytes.slice(142, 150))

  return {
    market,
    shard,
    lpPool,
    collateralMint,
    pooledEngineIndex,
    lpFeeBps,
    protocolFeeBps,
    createdAtSlot,
  }
}

export function parseLpPositionOpenedEvent(
  bytes: Uint8Array,
): LpPositionOpenedEvent | null {
  if (
    bytes.length !== ANCHOR_LP_POSITION_OPENED_BYTES_LEN ||
    !hasPrefix(bytes, ANCHOR_LP_POSITION_OPENED_DISCRIMINATOR)
  )
    return null

  const market = bs58.encode(bytes.slice(8, 40))
  const shard = bs58.encode(bytes.slice(40, 72))
  const lpPool = bs58.encode(bytes.slice(72, 104))
  const owner = bs58.encode(bytes.slice(104, 136))
  const lpPosition = bs58.encode(bytes.slice(136, 168))
  const shares = readU64LE(bytes.slice(168, 176))
  const accountingNav = readU64LE(bytes.slice(176, 184))

  return {
    market,
    shard,
    lpPool,
    owner,
    lpPosition,
    shares,
    accountingNav,
  }
}

export function parseLpBandConfiguredEvent(
  bytes: Uint8Array,
): LpBandConfiguredEvent | null {
  if (
    bytes.length !== ANCHOR_LP_BAND_CONFIGURED_BYTES_LEN ||
    !hasPrefix(bytes, ANCHOR_LP_BAND_CONFIGURED_DISCRIMINATOR)
  )
    return null

  const market = bs58.encode(bytes.slice(8, 40))
  const shard = bs58.encode(bytes.slice(40, 72))
  const lpPool = bs58.encode(bytes.slice(72, 104))
  const owner = bs58.encode(bytes.slice(104, 136))
  const lpBandConfig = bs58.encode(bytes.slice(136, 168))
  const firstBandMaxNotional = readU64LE(bytes.slice(168, 176))
  const firstBandMaxOracleDeviationBps = readU16LE(bytes.slice(176, 178))
  const firstBandSpreadBps = readU16LE(bytes.slice(178, 180))
  const firstBandMaxInventoryBps = readU16LE(bytes.slice(180, 182))
  const secondBandMaxNotional = readU64LE(bytes.slice(182, 190))
  const secondBandMaxOracleDeviationBps = readU16LE(bytes.slice(190, 192))
  const secondBandSpreadBps = readU16LE(bytes.slice(192, 194))
  const secondBandMaxInventoryBps = readU16LE(bytes.slice(194, 196))
  const thirdBandMaxNotional = readU64LE(bytes.slice(196, 204))
  const thirdBandMaxOracleDeviationBps = readU16LE(bytes.slice(204, 206))
  const thirdBandSpreadBps = readU16LE(bytes.slice(206, 208))
  const thirdBandMaxInventoryBps = readU16LE(bytes.slice(208, 210))
  const updatedAtSlot = readU64LE(bytes.slice(210, 218))

  return {
    market,
    shard,
    lpPool,
    owner,
    lpBandConfig,
    firstBandMaxNotional,
    firstBandMaxOracleDeviationBps,
    firstBandSpreadBps,
    firstBandMaxInventoryBps,
    secondBandMaxNotional,
    secondBandMaxOracleDeviationBps,
    secondBandSpreadBps,
    secondBandMaxInventoryBps,
    thirdBandMaxNotional,
    thirdBandMaxOracleDeviationBps,
    thirdBandSpreadBps,
    thirdBandMaxInventoryBps,
    updatedAtSlot,
  }
}

export function parseDepositEvent(bytes: Uint8Array): DepositEvent | null {
  if (bytes.length === DEPOSIT_BYTES_LEN && bytes[0] === DEPOSIT_DISCRIMINATOR) {
    const market = bs58.encode(bytes.slice(1, 33))
    const shard = bs58.encode(bytes.slice(33, 65))
    const trader = bs58.encode(bytes.slice(65, 97))
    const owner = bs58.encode(bytes.slice(97, 129))
    const amount = readU64LE(bytes.slice(129, 137))
    const engineIndex = readU16LE(bytes.slice(137, 139))

    return { market, shard, trader, owner, amount, engineIndex }
  }

  if (
    bytes.length !== ANCHOR_DEPOSIT_EVENT_BYTES_LEN ||
    !hasPrefix(bytes, ANCHOR_DEPOSIT_EVENT_DISCRIMINATOR)
  )
    return null

  const market = bs58.encode(bytes.slice(8, 40))
  const shard = bs58.encode(bytes.slice(40, 72))
  const trader = bs58.encode(bytes.slice(72, 104))
  const owner = bs58.encode(bytes.slice(104, 136))
  const amount = readU64LE(bytes.slice(136, 144))
  const engineIndex = readU16LE(bytes.slice(144, 146))
  return { market, shard, trader, owner, amount, engineIndex }
}

export function parseCrankEvent(bytes: Uint8Array): CrankEvent | null {
  if (bytes.length !== CRANK_BYTES_LEN) return null
  if (bytes[0] !== CRANK_DISCRIMINATOR) return null

  const market = bs58.encode(bytes.slice(1, 33))
  const shard = bs58.encode(bytes.slice(33, 65))
  const nowSlot = readU64LE(bytes.slice(65, 73))
  const lastCrankSlot = readU64LE(bytes.slice(73, 81))
  const advanced = (bytes[81] ?? 0) !== 0

  return { market, shard, nowSlot, lastCrankSlot, advanced }
}

export function parseTradeExecutedEvent(
  bytes: Uint8Array,
): TradeExecutedEvent | null {
  if (bytes.length === TRADE_EXECUTED_BYTES_LEN && bytes[0] === TRADE_EXECUTED_DISCRIMINATOR) {
    const market = bs58.encode(bytes.slice(1, 33))
    const shard = bs58.encode(bytes.slice(33, 65))
    const trader = bs58.encode(bytes.slice(65, 97))
    const owner = bs58.encode(bytes.slice(97, 129))
    const sizeQ = readI64LE(bytes.slice(129, 137))
    const execPrice = readU64LE(bytes.slice(137, 145))
    const oraclePrice = readU64LE(bytes.slice(145, 153))
    const nowSlot = readU64LE(bytes.slice(153, 161))
    const oraclePostedSlot = readU64LE(bytes.slice(161, 169))

    return {
      market,
      shard,
      trader,
      owner,
      sizeQ,
      execPrice,
      oraclePrice,
      nowSlot,
      oraclePostedSlot,
    }
  }

  if (
    bytes.length !== ANCHOR_TRADE_EXECUTED_BYTES_LEN ||
    !hasPrefix(bytes, ANCHOR_TRADE_EXECUTED_DISCRIMINATOR)
  )
    return null

  const market = bs58.encode(bytes.slice(8, 40))
  const shard = bs58.encode(bytes.slice(40, 72))
  const trader = bs58.encode(bytes.slice(72, 104))
  const owner = bs58.encode(bytes.slice(104, 136))
  const sizeQ = readI64LE(bytes.slice(136, 144))
  const execPrice = readU64LE(bytes.slice(144, 152))
  const oraclePrice = readU64LE(bytes.slice(152, 160))
  const nowSlot = readU64LE(bytes.slice(160, 168))
  const oraclePostedSlot = readU64LE(bytes.slice(168, 176))

  return {
    market,
    shard,
    trader,
    owner,
    sizeQ,
    execPrice,
    oraclePrice,
    nowSlot,
    oraclePostedSlot,
  }
}

export function parseWithdrawalEvent(bytes: Uint8Array): WithdrawalEvent | null {
  if (bytes.length !== WITHDRAWAL_BYTES_LEN) return null
  if (bytes[0] !== WITHDRAWAL_DISCRIMINATOR) return null

  const market = bs58.encode(bytes.slice(1, 33))
  const shard = bs58.encode(bytes.slice(33, 65))
  const trader = bs58.encode(bytes.slice(65, 97))
  const owner = bs58.encode(bytes.slice(97, 129))
  const amount = readU64LE(bytes.slice(129, 137))
  const engineIndex = readU16LE(bytes.slice(137, 139))
  const nowSlot = readU64LE(bytes.slice(145, 153))
  const oraclePrice = readU64LE(bytes.slice(153, 161))
  const oraclePostedSlot = readU64LE(bytes.slice(161, 169))

  return {
    market,
    shard,
    trader,
    owner,
    amount,
    engineIndex,
    nowSlot,
    oraclePrice,
    oraclePostedSlot,
  }
}

export function parseLiquidationEvent(bytes: Uint8Array): LiquidationEvent | null {
  if (bytes.length !== LIQUIDATION_BYTES_LEN) return null
  if (bytes[0] !== LIQUIDATION_DISCRIMINATOR) return null

  const market = bs58.encode(bytes.slice(1, 33))
  const shard = bs58.encode(bytes.slice(33, 65))
  const keeper = bs58.encode(bytes.slice(65, 97))
  const liquidateeOwner = bs58.encode(bytes.slice(97, 129))
  const liquidateeEngineIndex = readU16LE(bytes.slice(129, 131))
  const liquidated = (bytes[131] ?? 0) !== 0
  const oldEffectivePosQ = readI64LE(bytes.slice(137, 145))
  const nowSlot = readU64LE(bytes.slice(145, 153))
  const oraclePrice = readU64LE(bytes.slice(153, 161))
  const oraclePostedSlot = readU64LE(bytes.slice(161, 169))

  return {
    market,
    shard,
    keeper,
    liquidateeOwner,
    liquidateeEngineIndex,
    liquidated,
    oldEffectivePosQ,
    nowSlot,
    oraclePrice,
    oraclePostedSlot,
  }
}


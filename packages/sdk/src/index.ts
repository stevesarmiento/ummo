import {
  AccountRole,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
} from "@solana/kit"

export const UMMO_MARKET_PROGRAM_ID = address(
  "GB2SgmYPnk7d2SPJbA7EaGXwWA6uSkJZH2WxUJjBc8A5",
)

export const UMMO_MARKET_PROGRAM_ADDRESS = UMMO_MARKET_PROGRAM_ID

export const SYSTEM_PROGRAM_ADDRESS = address(
  "11111111111111111111111111111111",
)

export const CLOCK_SYSVAR_ADDRESS = address(
  "SysvarC1ock11111111111111111111111111111111",
)

export const TOKEN_PROGRAM_ADDRESS = address(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
)

export const TOKEN_2022_PROGRAM_ADDRESS = address(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
)

export const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = address(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
)

export const MARKET_SEED = "market"
export const SHARD_SEED = "shard"
export const ENGINE_SEED = "engine"
export const TRADER_SEED = "trader"
export const LP_POOL_SEED = "lp_pool"
export const LP_POSITION_SEED = "lp_position"
export const LP_BAND_SEED = "lp_band"
export const RISK_STATE_SEED = "risk_state"
export const RAILS_SEED = "rails"
export const FUNDING_STATE_SEED = "funding_state"
export const MATCHER_ALLOWLIST_SEED = "matcher_allowlist"
export const LIQUIDATION_CONFIG_SEED = "liquidation_config"
export const FUNDING_ACCUMULATOR_SEED = "funding_accumulator"
export const TRADER_FUNDING_STATE_SEED = "trader_funding_state"

export const MAX_CRANK_STALENESS_SLOTS = 150n
export const POSITION_SCALE_Q = 1_000_000n

const addressEncoder = getAddressEncoder()

const INIT_MARKET_DISCRIMINATOR = new Uint8Array([
  33, 253, 15, 116, 89, 25, 127, 236,
])
const INIT_LP_POOL_DISCRIMINATOR = new Uint8Array([
  246, 49, 33, 164, 206, 183, 249, 160,
])
const DEPOSIT_LP_DISCRIMINATOR = new Uint8Array([
  83, 107, 16, 26, 26, 20, 130, 56,
])
const REQUEST_LP_WITHDRAW_DISCRIMINATOR = new Uint8Array([
  184, 139, 52, 50, 198, 146, 192, 123,
])
const CLAIM_LP_WITHDRAW_DISCRIMINATOR = new Uint8Array([
  76, 232, 199, 204, 141, 184, 8, 200,
])
const SET_LP_BAND_CONFIG_DISCRIMINATOR = new Uint8Array([
  177, 13, 242, 17, 137, 97, 151, 77,
])
const DEPOSIT_DISCRIMINATOR = new Uint8Array([
  242, 35, 198, 137, 82, 225, 242, 182,
])
const WITHDRAW_DISCRIMINATOR = new Uint8Array([
  183, 18, 70, 156, 148, 109, 161, 34,
])
const EXECUTE_TRADE_DISCRIMINATOR = new Uint8Array([
  77, 16, 192, 135, 13, 0, 106, 97,
])
const KEEPER_CRANK_DISCRIMINATOR = new Uint8Array([
  161, 54, 130, 134, 161, 11, 157, 31,
])
const LIQUIDATE_AT_ORACLE_DISCRIMINATOR = new Uint8Array([
  114, 205, 202, 240, 68, 84, 137, 29,
])
const OPEN_TRADER_DISCRIMINATOR = new Uint8Array([
  223, 155, 155, 23, 151, 167, 170, 229,
])
const INIT_SHARD_DISCRIMINATOR = new Uint8Array([
  52, 43, 132, 208, 128, 105, 135, 39,
])
const SET_MATCHER_AUTHORITY_DISCRIMINATOR = new Uint8Array([
  5, 94, 51, 114, 0, 5, 95, 40,
])
const SET_MATCHER_ALLOWLIST_DISCRIMINATOR = new Uint8Array([
  223, 108, 95, 154, 30, 124, 174, 60,
])
const SET_RISK_CONFIG_DISCRIMINATOR = new Uint8Array([
  119, 66, 177, 45, 121, 221, 30, 45,
])
const SET_MARKET_RAILS_DISCRIMINATOR = new Uint8Array([
  235, 129, 209, 6, 32, 71, 123, 121,
])
const SET_LIQUIDATION_CONFIG_DISCRIMINATOR = new Uint8Array([
  117, 125, 3, 240, 238, 159, 124, 49,
])
const TOUCH_TRADER_FUNDING_DISCRIMINATOR = new Uint8Array([
  217, 163, 115, 91, 157, 66, 43, 255,
])
const SYNC_TRADER_FUNDING_STATE_DISCRIMINATOR = new Uint8Array([
  68, 5, 163, 247, 100, 30, 216, 149,
])
const SET_FUNDING_RATE_DISCRIMINATOR = new Uint8Array([
  113, 127, 53, 135, 107, 37, 58, 65,
])
const CLOSE_ACCOUNT_DISCRIMINATOR = new Uint8Array([
  125, 255, 149, 14, 110, 34, 72, 24,
])
const CLOSE_TRADER_DISCRIMINATOR = new Uint8Array([
  26, 12, 56, 104, 212, 12, 186, 205,
])
const RECLAIM_EMPTY_ACCOUNT_DISCRIMINATOR = new Uint8Array([
  126, 9, 242, 33, 58, 222, 8, 150,
])
const GARBAGE_COLLECT_DUST_DISCRIMINATOR = new Uint8Array([
  11, 218, 6, 30, 44, 2, 156, 211,
])

function u64le(value: bigint): Uint8Array {
  const out = new Uint8Array(8)
  let v = value
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}

function u16le(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff])
}

function u32le(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  ])
}

function i64le(value: bigint): Uint8Array {
  const out = new Uint8Array(8)
  let v = BigInt.asUintN(64, BigInt.asIntN(64, value))
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}

function quoteBandBytes(args: {
  maxNotional: bigint
  maxOracleDeviationBps: number
  spreadBps: number
  maxInventoryBps: number
}): Uint8Array {
  return concatBytes(
    u64le(args.maxNotional),
    u16le(args.maxOracleDeviationBps),
    u16le(args.spreadBps),
    u16le(args.maxInventoryBps),
  )
}

function railTierBytes(args: { maxNotional: bigint; maxOracleDeviationBps: number }): Uint8Array {
  return concatBytes(u64le(args.maxNotional), u16le(args.maxOracleDeviationBps))
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(len)
  let cursor = 0
  for (const part of parts) {
    out.set(part, cursor)
    cursor += part.length
  }
  return out
}

export async function getMarketAddress(args: {
  oracleFeed: Address
}): Promise<Address> {
  const [market] = await getProgramDerivedAddress({
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    seeds: [MARKET_SEED, addressEncoder.encode(args.oracleFeed)],
  })
  return market
}

export async function getShardAddress(args: {
  market: Address
  shardSeed: Address
}): Promise<Address> {
  const [shard] = await getProgramDerivedAddress({
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    seeds: [
      SHARD_SEED,
      addressEncoder.encode(args.market),
      addressEncoder.encode(args.shardSeed),
    ],
  })
  return shard
}

export async function getEngineAddress(args: { shard: Address }): Promise<Address> {
  const [engine] = await getProgramDerivedAddress({
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    seeds: [ENGINE_SEED, addressEncoder.encode(args.shard)],
  })
  return engine
}

export async function getRiskStateAddress(args: { shard: Address }): Promise<Address> {
  const [riskState] = await getProgramDerivedAddress({
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    seeds: [RISK_STATE_SEED, addressEncoder.encode(args.shard)],
  })
  return riskState
}

export async function getRailsAddress(args: { shard: Address }): Promise<Address> {
  const [rails] = await getProgramDerivedAddress({
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    seeds: [RAILS_SEED, addressEncoder.encode(args.shard)],
  })
  return rails
}

export async function getFundingStateAddress(args: { shard: Address }): Promise<Address> {
  const [fundingState] = await getProgramDerivedAddress({
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    seeds: [FUNDING_STATE_SEED, addressEncoder.encode(args.shard)],
  })
  return fundingState
}

export async function getLiquidationConfigAddress(args: {
  shard: Address
}): Promise<Address> {
  const [config] = await getProgramDerivedAddress({
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    seeds: [LIQUIDATION_CONFIG_SEED, addressEncoder.encode(args.shard)],
  })
  return config
}

export async function getFundingAccumulatorAddress(args: { shard: Address }): Promise<Address> {
  const [acc] = await getProgramDerivedAddress({
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    seeds: [FUNDING_ACCUMULATOR_SEED, addressEncoder.encode(args.shard)],
  })
  return acc
}

export async function getTraderFundingStateAddress(args: {
  trader: Address
}): Promise<Address> {
  const [state] = await getProgramDerivedAddress({
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    seeds: [TRADER_FUNDING_STATE_SEED, addressEncoder.encode(args.trader)],
  })
  return state
}

export async function getMatcherAllowlistAddress(args: {
  market: Address
}): Promise<Address> {
  const [allowlist] = await getProgramDerivedAddress({
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    seeds: [MATCHER_ALLOWLIST_SEED, addressEncoder.encode(args.market)],
  })
  return allowlist
}

export async function getTraderAddress(args: {
  shard: Address
  owner: Address
}): Promise<Address> {
  const [trader] = await getProgramDerivedAddress({
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    seeds: [
      TRADER_SEED,
      addressEncoder.encode(args.shard),
      addressEncoder.encode(args.owner),
    ],
  })
  return trader
}

export async function getLpPoolAddress(args: { shard: Address }): Promise<Address> {
  const [lpPool] = await getProgramDerivedAddress({
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    seeds: [LP_POOL_SEED, addressEncoder.encode(args.shard)],
  })
  return lpPool
}

export async function getLpPositionAddress(args: {
  lpPool: Address
  owner: Address
}): Promise<Address> {
  const [lpPosition] = await getProgramDerivedAddress({
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    seeds: [
      LP_POSITION_SEED,
      addressEncoder.encode(args.lpPool),
      addressEncoder.encode(args.owner),
    ],
  })
  return lpPosition
}

export async function getLpBandConfigAddress(args: {
  lpPool: Address
  owner: Address
}): Promise<Address> {
  const [lpBand] = await getProgramDerivedAddress({
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    seeds: [
      LP_BAND_SEED,
      addressEncoder.encode(args.lpPool),
      addressEncoder.encode(args.owner),
    ],
  })
  return lpBand
}

export async function getAssociatedTokenAddress(args: {
  owner: Address
  mint: Address
  tokenProgram?: Address
}): Promise<Address> {
  const tokenProgram = args.tokenProgram ?? TOKEN_PROGRAM_ADDRESS
  const [ata] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    seeds: [
      addressEncoder.encode(args.owner),
      addressEncoder.encode(tokenProgram),
      addressEncoder.encode(args.mint),
    ],
  })
  return ata
}

export function getInitMarketInstruction(args: {
  payer: Address
  collateralMint: Address
  oracleFeed: Address
  matcherAuthority: Address
  market: Address
  marketId: bigint
}): Instruction {
  if (args.marketId < 0n || args.marketId > 18_446_744_073_709_551_615n)
    throw new Error("marketId out of range")

  const data = concatBytes(INIT_MARKET_DISCRIMINATOR, u64le(args.marketId))

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.payer, role: AccountRole.WRITABLE_SIGNER },
      { address: args.collateralMint, role: AccountRole.READONLY },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.matcherAuthority, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getInitLpPoolInstruction(args: {
  payer: Address
  oracleFeed: Address
  market: Address
  shard: Address
  lpPool: Address
}): Instruction {
  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.payer, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.lpPool, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data: INIT_LP_POOL_DISCRIMINATOR,
  }
}

export function getDepositLpInstruction(args: {
  owner: Address
  oracleFeed: Address
  market: Address
  shard: Address
  lpPool: Address
  engine: Address
  lpPosition: Address
  collateralMint: Address
  userCollateral: Address
  vaultCollateral: Address
  tokenProgram: Address
  amount: bigint
}): Instruction {
  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.owner, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.lpPool, role: AccountRole.WRITABLE },
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: args.lpPosition, role: AccountRole.WRITABLE },
      { address: args.collateralMint, role: AccountRole.READONLY },
      { address: args.userCollateral, role: AccountRole.WRITABLE },
      { address: args.vaultCollateral, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: args.tokenProgram, role: AccountRole.READONLY },
    ],
    data: concatBytes(DEPOSIT_LP_DISCRIMINATOR, u64le(args.amount)),
  }
}

export function getRequestLpWithdrawInstruction(args: {
  owner: Address
  oracleFeed: Address
  market: Address
  shard: Address
  lpPool: Address
  lpPosition: Address
  shares: bigint
}): Instruction {
  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.owner, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.lpPool, role: AccountRole.WRITABLE },
      { address: args.lpPosition, role: AccountRole.WRITABLE },
    ],
    data: concatBytes(REQUEST_LP_WITHDRAW_DISCRIMINATOR, u64le(args.shares)),
  }
}

export function getClaimLpWithdrawInstruction(args: {
  owner: Address
  oracleFeed: Address
  market: Address
  shard: Address
  riskState: Address
  engine: Address
  lpPool: Address
  lpPosition: Address
  collateralMint: Address
  userCollateral: Address
  vaultCollateral: Address
  tokenProgram: Address
}): Instruction {
  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.owner, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.riskState, role: AccountRole.WRITABLE },
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: args.lpPool, role: AccountRole.WRITABLE },
      { address: args.lpPosition, role: AccountRole.WRITABLE },
      { address: args.collateralMint, role: AccountRole.READONLY },
      { address: args.userCollateral, role: AccountRole.WRITABLE },
      { address: args.vaultCollateral, role: AccountRole.WRITABLE },
      { address: args.tokenProgram, role: AccountRole.READONLY },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data: CLAIM_LP_WITHDRAW_DISCRIMINATOR,
  }
}

export function getSetLpBandConfigInstruction(args: {
  owner: Address
  oracleFeed: Address
  market: Address
  shard: Address
  lpPool: Address
  lpBandConfig: Address
  bands: Array<{
    maxNotional: bigint
    maxOracleDeviationBps: number
    spreadBps: number
    maxInventoryBps: number
  }>
}): Instruction {
  if (args.bands.length !== 3) throw new Error("bands must contain exactly 3 items")
  const bandBytes = args.bands.map((band) => quoteBandBytes(band))
  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.owner, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.lpPool, role: AccountRole.READONLY },
      { address: args.lpBandConfig, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data: concatBytes(SET_LP_BAND_CONFIG_DISCRIMINATOR, ...bandBytes),
  }
}

export function getOpenTraderInstruction(args: {
  owner: Address
  oracleFeed: Address
  market: Address
  shard: Address
  engine: Address
  trader: Address
}): Instruction {
  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.owner, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: args.trader, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data: OPEN_TRADER_DISCRIMINATOR,
  }
}

export function getInitShardInstruction(args: {
  payer: Address
  oracleFeed: Address
  market: Address
  shardSeed: Address
  shard: Address
  riskState: Address
  rails: Address
  engine: Address
  shardId: number
}): Instruction {
  if (args.shardId < 0 || args.shardId > 65_535) throw new Error("shardId out of range")

  const data = concatBytes(INIT_SHARD_DISCRIMINATOR, u16le(args.shardId))

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.payer, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shardSeed, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.WRITABLE },
      { address: args.riskState, role: AccountRole.WRITABLE },
      { address: args.rails, role: AccountRole.WRITABLE },
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getSetMatcherAuthorityInstruction(args: {
  authority: Address
  oracleFeed: Address
  market: Address
  newMatcherAuthority: Address
}): Instruction {
  const data = SET_MATCHER_AUTHORITY_DISCRIMINATOR

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.authority, role: AccountRole.READONLY_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.WRITABLE },
      { address: args.newMatcherAuthority, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getSetMatcherAllowlistInstruction(args: {
  authority: Address
  oracleFeed: Address
  market: Address
  matcherAllowlist: Address
  isEnabled: boolean
  matchers: Address[]
}): Instruction {
  if (args.matchers.length > 8) throw new Error("matchers exceeds 8")

  const matchersBytes = concatBytes(
    ...args.matchers.map((m) => new Uint8Array(addressEncoder.encode(m))),
  )
  const data = concatBytes(
    SET_MATCHER_ALLOWLIST_DISCRIMINATOR,
    new Uint8Array([args.isEnabled ? 1 : 0]),
    u32le(args.matchers.length),
    matchersBytes,
  )

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.authority, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.matcherAllowlist, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getSetRiskConfigInstruction(args: {
  authority: Address
  oracleFeed: Address
  market: Address
  shard: Address
  riskState: Address
  symHalfLifeSlots: bigint
  dirHalfLifeSlots: bigint
}): Instruction {
  const data = concatBytes(
    SET_RISK_CONFIG_DISCRIMINATOR,
    u64le(args.symHalfLifeSlots),
    u64le(args.dirHalfLifeSlots),
  )

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.authority, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.riskState, role: AccountRole.WRITABLE },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getSetMarketRailsInstruction(args: {
  authority: Address
  oracleFeed: Address
  market: Address
  shard: Address
  rails: Address
  tiers: Array<{ maxNotional: bigint; maxOracleDeviationBps: number }>
}): Instruction {
  if (args.tiers.length !== 3) throw new Error("tiers must contain exactly 3 items")

  const tiersBytes = args.tiers.map((tier) => railTierBytes(tier))
  const data = concatBytes(SET_MARKET_RAILS_DISCRIMINATOR, ...tiersBytes)

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.authority, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.rails, role: AccountRole.WRITABLE },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getSetLiquidationConfigInstruction(args: {
  authority: Address
  oracleFeed: Address
  market: Address
  shard: Address
  liquidationConfig: Address
  isEnabled: boolean
  bountyShareBps: number
  bountyCapAbs: bigint
}): Instruction {
  if (args.bountyShareBps < 0 || args.bountyShareBps > 10_000)
    throw new Error("bountyShareBps out of range")

  const data = concatBytes(
    SET_LIQUIDATION_CONFIG_DISCRIMINATOR,
    new Uint8Array([args.isEnabled ? 1 : 0]),
    u16le(args.bountyShareBps),
    u64le(args.bountyCapAbs),
  )

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.authority, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.liquidationConfig, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getTouchTraderFundingInstruction(args: {
  signer: Address
  oracleFeed: Address
  market: Address
  shard: Address
  riskState: Address
  trader: Address
  engine: Address
  fundingAccumulator: Address
  traderFundingState: Address
}): Instruction {
  const data = TOUCH_TRADER_FUNDING_DISCRIMINATOR

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.signer, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.riskState, role: AccountRole.WRITABLE },
      { address: args.trader, role: AccountRole.READONLY },
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: args.fundingAccumulator, role: AccountRole.WRITABLE },
      { address: args.traderFundingState, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getSyncTraderFundingStateInstruction(args: {
  signer: Address
  oracleFeed: Address
  market: Address
  shard: Address
  trader: Address
  fundingAccumulator: Address
  traderFundingState: Address
}): Instruction {
  const data = SYNC_TRADER_FUNDING_STATE_DISCRIMINATOR

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.signer, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.trader, role: AccountRole.READONLY },
      { address: args.fundingAccumulator, role: AccountRole.WRITABLE },
      { address: args.traderFundingState, role: AccountRole.WRITABLE },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getSetFundingRateInstruction(args: {
  signer: Address
  oracleFeed: Address
  market: Address
  shard: Address
  fundingState: Address
  engine: Address
  newRateBpsPerSlot: bigint
}): Instruction {
  const data = concatBytes(
    SET_FUNDING_RATE_DISCRIMINATOR,
    i64le(args.newRateBpsPerSlot),
  )

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.signer, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.fundingState, role: AccountRole.WRITABLE },
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getDepositInstruction(args: {
  owner: Address
  oracleFeed: Address
  market: Address
  shard: Address
  engine: Address
  trader: Address
  collateralMint: Address
  userCollateral: Address
  vaultCollateral: Address
  tokenProgram: Address
  amount: bigint
}): Instruction {
  const data = concatBytes(DEPOSIT_DISCRIMINATOR, u64le(args.amount))

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.owner, role: AccountRole.READONLY_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: args.trader, role: AccountRole.READONLY },
      { address: args.collateralMint, role: AccountRole.READONLY },
      { address: args.userCollateral, role: AccountRole.WRITABLE },
      { address: args.vaultCollateral, role: AccountRole.WRITABLE },
      { address: args.tokenProgram, role: AccountRole.READONLY },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getWithdrawInstruction(args: {
  owner: Address
  oracleFeed: Address
  market: Address
  shard: Address
  riskState: Address
  engine: Address
  trader: Address
  collateralMint: Address
  userCollateral: Address
  vaultCollateral: Address
  tokenProgram: Address
  amount: bigint
}): Instruction {
  const data = concatBytes(WITHDRAW_DISCRIMINATOR, u64le(args.amount))

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.owner, role: AccountRole.READONLY_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.riskState, role: AccountRole.WRITABLE },
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: args.trader, role: AccountRole.READONLY },
      { address: args.collateralMint, role: AccountRole.READONLY },
      { address: args.userCollateral, role: AccountRole.WRITABLE },
      { address: args.vaultCollateral, role: AccountRole.WRITABLE },
      { address: args.tokenProgram, role: AccountRole.READONLY },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getCloseAccountInstruction(args: {
  owner: Address
  oracleFeed: Address
  market: Address
  shard: Address
  riskState: Address
  engine: Address
  collateralMint: Address
  userCollateral: Address
  vaultCollateral: Address
  tokenProgram: Address
  engineIndex: number
}): Instruction {
  if (args.engineIndex < 0 || args.engineIndex > 65_535)
    throw new Error("engineIndex out of range")

  const data = concatBytes(CLOSE_ACCOUNT_DISCRIMINATOR, u16le(args.engineIndex))

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.owner, role: AccountRole.READONLY_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.riskState, role: AccountRole.WRITABLE },
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: args.collateralMint, role: AccountRole.READONLY },
      { address: args.userCollateral, role: AccountRole.WRITABLE },
      { address: args.vaultCollateral, role: AccountRole.WRITABLE },
      { address: args.tokenProgram, role: AccountRole.READONLY },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getCloseTraderInstruction(args: {
  owner: Address
  oracleFeed: Address
  market: Address
  shard: Address
  riskState: Address
  engine: Address
  trader: Address
  collateralMint: Address
  userCollateral: Address
  vaultCollateral: Address
  tokenProgram: Address
}): Instruction {
  const data = CLOSE_TRADER_DISCRIMINATOR

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.owner, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.riskState, role: AccountRole.WRITABLE },
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: args.trader, role: AccountRole.WRITABLE },
      { address: args.collateralMint, role: AccountRole.READONLY },
      { address: args.userCollateral, role: AccountRole.WRITABLE },
      { address: args.vaultCollateral, role: AccountRole.WRITABLE },
      { address: args.tokenProgram, role: AccountRole.READONLY },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getReclaimEmptyAccountInstruction(args: {
  payer: Address
  oracleFeed: Address
  market: Address
  shard: Address
  engine: Address
  engineIndex: number
}): Instruction {
  if (args.engineIndex < 0 || args.engineIndex > 65_535)
    throw new Error("engineIndex out of range")

  const data = concatBytes(RECLAIM_EMPTY_ACCOUNT_DISCRIMINATOR, u16le(args.engineIndex))

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.payer, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getGarbageCollectDustInstruction(args: {
  payer: Address
  oracleFeed: Address
  market: Address
  shard: Address
  engine: Address
}): Instruction {
  const data = GARBAGE_COLLECT_DUST_DISCRIMINATOR

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.payer, role: AccountRole.WRITABLE_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}

export function getExecuteTradeInstruction(args: {
  owner: Address
  matcher: Address
  oracleFeed: Address
  market: Address
  shard: Address
  riskState: Address
  rails: Address
  engine: Address
  lpPool: Address
  trader: Address
  matcherAllowlist?: Address
  execPrice: bigint
  sizeQ: bigint
}): Instruction {
  const data = concatBytes(
    EXECUTE_TRADE_DISCRIMINATOR,
    u64le(args.execPrice),
    i64le(args.sizeQ),
  )

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.owner, role: AccountRole.READONLY_SIGNER },
      { address: args.matcher, role: AccountRole.READONLY_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.riskState, role: AccountRole.WRITABLE },
      { address: args.rails, role: AccountRole.READONLY },
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: args.lpPool, role: AccountRole.WRITABLE },
      { address: args.trader, role: AccountRole.READONLY },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
      ...(args.matcherAllowlist
        ? [{ address: args.matcherAllowlist, role: AccountRole.READONLY as const }]
        : []),
    ],
    data,
  }
}

export function getKeeperCrankInstruction(args: {
  keeper: Address
  oracleFeed: Address
  market: Address
  shard: Address
  engine: Address
  riskState?: Address
  nowSlot: bigint
  oraclePrice: bigint
  orderedCandidates: number[]
  maxRevalidations: number
}): Instruction {
  const n = args.orderedCandidates.length
  if (n > 512) throw new Error("orderedCandidates exceeds 512")

  const orderedCandidates = new Uint8Array(n * 2)
  let cursor = 0
  for (const idx of args.orderedCandidates) {
    orderedCandidates.set(u16le(idx), cursor)
    cursor += 2
  }

  const data = concatBytes(
    KEEPER_CRANK_DISCRIMINATOR,
    u64le(args.nowSlot),
    u64le(args.oraclePrice),
    u32le(n),
    orderedCandidates,
    u16le(args.maxRevalidations),
  )

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.keeper, role: AccountRole.READONLY_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.WRITABLE },
      { address: args.engine, role: AccountRole.WRITABLE },
      ...(args.riskState
        ? [{ address: args.riskState, role: AccountRole.WRITABLE as const }]
        : []),
    ],
    data,
  }
}

export function getLiquidateAtOracleInstruction(args: {
  keeper: Address
  oracleFeed: Address
  market: Address
  shard: Address
  riskState: Address
  engine: Address
  liquidationConfig?: Address
  collateralMint: Address
  keeperCollateral: Address
  vaultCollateral: Address
  tokenProgram: Address
  liquidateeEngineIndex: number
}): Instruction {
  if (args.liquidateeEngineIndex < 0 || args.liquidateeEngineIndex > 65_535)
    throw new Error("liquidateeEngineIndex out of range")

  const data = concatBytes(
    LIQUIDATE_AT_ORACLE_DISCRIMINATOR,
    u16le(args.liquidateeEngineIndex),
  )

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.keeper, role: AccountRole.READONLY_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.riskState, role: AccountRole.WRITABLE },
      { address: args.engine, role: AccountRole.WRITABLE },
      ...(args.liquidationConfig
        ? [{ address: args.liquidationConfig, role: AccountRole.READONLY as const }]
        : []),
      { address: args.collateralMint, role: AccountRole.READONLY },
      { address: args.keeperCollateral, role: AccountRole.WRITABLE },
      { address: args.vaultCollateral, role: AccountRole.WRITABLE },
      { address: args.tokenProgram, role: AccountRole.READONLY },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}



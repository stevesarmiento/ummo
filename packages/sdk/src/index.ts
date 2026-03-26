import {
  AccountRole,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
} from "@solana/kit"

export const UMMO_MARKET_PROGRAM_ID = address(
  "DiJFu657Rn1cncewnpsoWsqSxWKaQYpivVxGXSsC9vwB",
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
}): Promise<Address> {
  const [ata] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    seeds: [
      addressEncoder.encode(args.owner),
      addressEncoder.encode(TOKEN_PROGRAM_ADDRESS),
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
  userCollateral: Address
  vaultCollateral: Address
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
      { address: args.userCollateral, role: AccountRole.WRITABLE },
      { address: args.vaultCollateral, role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data: concatBytes(DEPOSIT_LP_DISCRIMINATOR, u64le(args.amount)),
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

export function getDepositInstruction(args: {
  owner: Address
  oracleFeed: Address
  market: Address
  shard: Address
  engine: Address
  trader: Address
  userCollateral: Address
  vaultCollateral: Address
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
      { address: args.userCollateral, role: AccountRole.WRITABLE },
      { address: args.vaultCollateral, role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
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
  engine: Address
  trader: Address
  userCollateral: Address
  vaultCollateral: Address
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
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: args.trader, role: AccountRole.READONLY },
      { address: args.userCollateral, role: AccountRole.WRITABLE },
      { address: args.vaultCollateral, role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
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
  engine: Address
  lpPool: Address
  trader: Address
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
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: args.lpPool, role: AccountRole.WRITABLE },
      { address: args.trader, role: AccountRole.READONLY },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
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
    ],
    data,
  }
}

export function getLiquidateAtOracleInstruction(args: {
  keeper: Address
  oracleFeed: Address
  market: Address
  shard: Address
  engine: Address
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
      { address: args.engine, role: AccountRole.WRITABLE },
    ],
    data,
  }
}



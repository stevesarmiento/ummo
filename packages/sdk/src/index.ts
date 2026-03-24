import {
  AccountRole,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
} from "@solana/kit"

export const UMMO_MARKET_PROGRAM_ID = address(
  "EMN8q6Lz1uhBqJusVygXxQvcFt3tmFCB4hnpk2Bbhymu",
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

export const MAX_CRANK_STALENESS_SLOTS = 150n
export const POSITION_SCALE_Q = 1_000_000n

const addressEncoder = getAddressEncoder()

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

function i64le(value: bigint): Uint8Array {
  const out = new Uint8Array(8)
  let v = BigInt.asUintN(64, BigInt.asIntN(64, value))
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn)
    v >>= 8n
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

  const data = new Uint8Array(1 + 8)
  data[0] = 0
  data.set(u64le(args.marketId), 1)

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.payer, role: AccountRole.WRITABLE_SIGNER },
      { address: args.collateralMint, role: AccountRole.READONLY },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.matcherAuthority, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
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
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data: new Uint8Array([6]),
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

  const data = new Uint8Array(1 + 2)
  data[0] = 7
  data.set(u16le(args.shardId), 1)

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
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
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
  const data = new Uint8Array([8])

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.authority, role: AccountRole.READONLY_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.WRITABLE },
      { address: args.newMatcherAuthority, role: AccountRole.READONLY },
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
  userCollateral: Address
  vaultCollateral: Address
  amount: bigint
}): Instruction {
  const data = new Uint8Array(1 + 8)
  data[0] = 1
  data.set(u64le(args.amount), 1)

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
  const data = new Uint8Array(1 + 8)
  data[0] = 2
  data.set(u64le(args.amount), 1)

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

export function getExecuteTradeInstruction(args: {
  owner: Address
  matcher: Address
  oracleFeed: Address
  market: Address
  shard: Address
  engine: Address
  trader: Address
  execPrice: bigint
  sizeQ: bigint
}): Instruction {
  const data = new Uint8Array(1 + 8 + 8)
  data[0] = 3
  data.set(u64le(args.execPrice), 1)
  data.set(i64le(args.sizeQ), 1 + 8)

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.owner, role: AccountRole.READONLY_SIGNER },
      { address: args.matcher, role: AccountRole.READONLY_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.engine, role: AccountRole.WRITABLE },
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

  const data = new Uint8Array(1 + 8 + 8 + 2 + n * 2 + 2)
  data[0] = 4
  data.set(u64le(args.nowSlot), 1)
  data.set(u64le(args.oraclePrice), 1 + 8)
  data.set(u16le(n), 1 + 8 + 8)

  let cursor = 1 + 8 + 8 + 2
  for (const idx of args.orderedCandidates) {
    data.set(u16le(idx), cursor)
    cursor += 2
  }
  data.set(u16le(args.maxRevalidations), cursor)

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.keeper, role: AccountRole.READONLY_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.WRITABLE },
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
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

  const data = new Uint8Array(1 + 2)
  data[0] = 5
  data.set(u16le(args.liquidateeEngineIndex), 1)

  return {
    programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
    accounts: [
      { address: args.keeper, role: AccountRole.READONLY_SIGNER },
      { address: args.oracleFeed, role: AccountRole.READONLY },
      { address: args.market, role: AccountRole.READONLY },
      { address: args.shard, role: AccountRole.READONLY },
      { address: args.engine, role: AccountRole.WRITABLE },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  }
}



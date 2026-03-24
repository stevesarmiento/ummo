import { describe, expect, test } from "bun:test"
import { AccountRole, address } from "@solana/kit"

import {
  CLOCK_SYSVAR_ADDRESS,
  getInitMarketInstruction,
  getSetMatcherAuthorityInstruction,
  getShardAddress,
  SYSTEM_PROGRAM_ADDRESS,
  SHARD_SEED,
  UMMO_MARKET_PROGRAM_ADDRESS,
} from "./index"

describe("sdk instruction builders", () => {
  test("getInitMarketInstruction builds expected accounts/data", () => {
    const payer = address("11111111111111111111111111111111")
    const collateralMint = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
    const oracleFeed = address("SysvarC1ock11111111111111111111111111111111")
    const matcherAuthority = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
    const market = address("EMN8q6Lz1uhBqJusVygXxQvcFt3tmFCB4hnpk2Bbhymu")

    const ix = getInitMarketInstruction({
      payer,
      collateralMint,
      oracleFeed,
      matcherAuthority,
      market,
      marketId: 42n,
    })

    expect(ix.programAddress).toBe(UMMO_MARKET_PROGRAM_ADDRESS)
    expect(Array.from(ix.data ?? new Uint8Array())).toEqual([0, 42, 0, 0, 0, 0, 0, 0, 0])
    expect(ix.accounts?.length).toBe(7)
    expect(ix.accounts?.[0]).toEqual({ address: payer, role: AccountRole.WRITABLE_SIGNER })
    expect(ix.accounts?.[1]).toEqual({ address: collateralMint, role: AccountRole.READONLY })
    expect(ix.accounts?.[2]).toEqual({ address: oracleFeed, role: AccountRole.READONLY })
    expect(ix.accounts?.[3]).toEqual({ address: matcherAuthority, role: AccountRole.READONLY })
    expect(ix.accounts?.[4]).toEqual({ address: market, role: AccountRole.WRITABLE })
    expect(ix.accounts?.[5]).toEqual({ address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY })
    expect(ix.accounts?.[6]).toEqual({ address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY })
  })

  test("getSetMatcherAuthorityInstruction builds expected accounts/data", () => {
    const authority = address("11111111111111111111111111111111")
    const oracleFeed = address("SysvarC1ock11111111111111111111111111111111")
    const market = address("EMN8q6Lz1uhBqJusVygXxQvcFt3tmFCB4hnpk2Bbhymu")
    const newMatcherAuthority = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")

    const ix = getSetMatcherAuthorityInstruction({
      authority,
      oracleFeed,
      market,
      newMatcherAuthority,
    })

    expect(ix.programAddress).toBe(UMMO_MARKET_PROGRAM_ADDRESS)
    expect(Array.from(ix.data ?? new Uint8Array())).toEqual([8])
    expect(ix.accounts?.length).toBe(5)
    expect(ix.accounts?.[0]).toEqual({
      address: authority,
      role: AccountRole.READONLY_SIGNER,
    })
    expect(ix.accounts?.[1]).toEqual({ address: oracleFeed, role: AccountRole.READONLY })
    expect(ix.accounts?.[2]).toEqual({ address: market, role: AccountRole.WRITABLE })
    expect(ix.accounts?.[3]).toEqual({
      address: newMatcherAuthority,
      role: AccountRole.READONLY,
    })
    expect(ix.accounts?.[4]).toEqual({ address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY })
  })

  test("getShardAddress varies by shardSeed", async () => {
    const market = address("EMN8q6Lz1uhBqJusVygXxQvcFt3tmFCB4hnpk2Bbhymu")
    const seedA = address("11111111111111111111111111111111")
    const seedB = address("SysvarC1ock11111111111111111111111111111111")

    const shardA = await getShardAddress({ market, shardSeed: seedA })
    const shardB = await getShardAddress({ market, shardSeed: seedB })

    expect(SHARD_SEED).toBe("shard")
    expect(shardA).not.toBe(shardB)
  })
})


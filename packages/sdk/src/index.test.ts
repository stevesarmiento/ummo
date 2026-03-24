import { describe, expect, test } from "bun:test"
import { AccountRole, address } from "@solana/kit"

import {
  CLOCK_SYSVAR_ADDRESS,
  getSetMatcherAuthorityInstruction,
  getShardAddress,
  SHARD_SEED,
  UMMO_MARKET_PROGRAM_ADDRESS,
} from "./index"

describe("sdk instruction builders", () => {
  test("getSetMatcherAuthorityInstruction builds expected accounts/data", () => {
    const authority = address("11111111111111111111111111111111")
    const oracleFeed = address("SysvarC1ock11111111111111111111111111111111")
    const market = address("4AboEjY4zXBF5QmDQCPT4XnaaU3pEGnCDuVy5HzR9T8e")
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
    const market = address("4AboEjY4zXBF5QmDQCPT4XnaaU3pEGnCDuVy5HzR9T8e")
    const seedA = address("11111111111111111111111111111111")
    const seedB = address("SysvarC1ock11111111111111111111111111111111")

    const shardA = await getShardAddress({ market, shardSeed: seedA })
    const shardB = await getShardAddress({ market, shardSeed: seedB })

    expect(SHARD_SEED).toBe("shard")
    expect(shardA).not.toBe(shardB)
  })
})


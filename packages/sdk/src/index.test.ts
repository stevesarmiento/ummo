import { describe, expect, test } from "bun:test"
import { AccountRole, address } from "@solana/kit"

import {
  getAssociatedTokenAddress,
  getDepositInstruction,
  getInitMarketInstruction,
  getSetMatcherAuthorityInstruction,
  getShardAddress,
  SYSTEM_PROGRAM_ADDRESS,
  SHARD_SEED,
  TOKEN_2022_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
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
    expect(Array.from(ix.data ?? new Uint8Array())).toEqual([
      33, 253, 15, 116, 89, 25, 127, 236, 42, 0, 0, 0, 0, 0, 0, 0,
    ])
    expect(ix.accounts?.length).toBe(6)
    expect(ix.accounts?.[0]).toEqual({ address: payer, role: AccountRole.WRITABLE_SIGNER })
    expect(ix.accounts?.[1]).toEqual({ address: collateralMint, role: AccountRole.READONLY })
    expect(ix.accounts?.[2]).toEqual({ address: oracleFeed, role: AccountRole.READONLY })
    expect(ix.accounts?.[3]).toEqual({ address: matcherAuthority, role: AccountRole.READONLY })
    expect(ix.accounts?.[4]).toEqual({ address: market, role: AccountRole.WRITABLE })
    expect(ix.accounts?.[5]).toEqual({ address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY })
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
    expect(Array.from(ix.data ?? new Uint8Array())).toEqual([
      5, 94, 51, 114, 0, 5, 95, 40,
    ])
    expect(ix.accounts?.length).toBe(4)
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

  test("getAssociatedTokenAddress varies by token program", async () => {
    const owner = address("11111111111111111111111111111111")
    const mint = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")

    const classicAta = await getAssociatedTokenAddress({ owner, mint })
    const token2022Ata = await getAssociatedTokenAddress({
      owner,
      mint,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })

    expect(classicAta).not.toBe(token2022Ata)
  })

  test("getDepositInstruction includes mint and token program", () => {
    const owner = address("11111111111111111111111111111111")
    const oracleFeed = address("SysvarC1ock11111111111111111111111111111111")
    const market = address("EMN8q6Lz1uhBqJusVygXxQvcFt3tmFCB4hnpk2Bbhymu")
    const shard = address("9jWb8nNQzbvGjA8f7mAb5mQqLQ87bKq2RERiQWw1wJ5Y")
    const engine = address("4UkgQ7Cg7D7ngA34QJ8iD9QLJ4P4Y3Dgz9Y1GmVo6JbN")
    const trader = address("8Upv8foR4VQ1p7SW77rEwYqWcXgQ6D9gph4mM2oY6N8c")
    const collateralMint = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
    const userCollateral = address("Fg6PaFpoGXkYsidMpWxTWqkZrL2Z7h4ZsS7Vb6bM7Qn")
    const vaultCollateral = address("3Nxs2mKk3j6WByY6V4sVS6jV5DqCH6kNqU9W9V6R7yL7")

    const ix = getDepositInstruction({
      owner,
      oracleFeed,
      market,
      shard,
      engine,
      trader,
      collateralMint,
      userCollateral,
      vaultCollateral,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      amount: 5_000_000n,
    })

    expect(ix.accounts?.[6]).toEqual({
      address: collateralMint,
      role: AccountRole.READONLY,
    })
    expect(ix.accounts?.[9]).toEqual({
      address: TOKEN_PROGRAM_ADDRESS,
      role: AccountRole.READONLY,
    })
  })
})


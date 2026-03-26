"use node"

import { actionGeneric, makeFunctionReference } from "convex/server"
import { v } from "convex/values"
import bs58 from "bs58"

import { createPrivateKeyFromBytes, signBytes } from "@solana/keys"

import { decodeBase64 } from "./lib/quasar_events"
import { getOraclePrice1e6FromPriceUpdateV2Bytes } from "./lib/pyth_receiver"

const MAX_CRANK_STALENESS_SLOTS = 150n
const MAX_ORACLE_STALENESS_SLOTS = 100_000_000n
const MAX_ORACLE_CONFIDENCE_BPS = 200n

const insertMatcherError = makeFunctionReference<"mutation">("matcherErrors:insert")
const getLpPoolByShard = makeFunctionReference<"query">("lpPools:getByShard")
const listLpBandsByPool = makeFunctionReference<"query">("lpBands:listByPool")
const listLpPositionsByPool = makeFunctionReference<"query">("lpPositions:listByPool")

interface LpPoolDoc {
  lpPool: string
  lpFeeBps: number
  protocolFeeBps: number
  totalShares: bigint
  accountingNav: bigint
}

interface LpPositionDoc {
  owner: string
  shares: bigint
}

interface LpBandDoc {
  owner: string
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
}

interface SyntheticDepthLevel {
  spreadBps: number
  maxOracleDeviationBps: number
  maxInventoryBps: number
  notional: bigint
}

function normalizeBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value
  if (typeof value === "number") return BigInt(value)
  if (typeof value === "string") return BigInt(value)
  return 0n
}

function applySpread(
  oraclePrice: bigint,
  spreadBps: number,
  side: "long" | "short",
): bigint {
  const delta = (oraclePrice * BigInt(spreadBps)) / 10_000n
  return side === "long" ? oraclePrice + delta : oraclePrice - delta
}

function buildSyntheticDepth(args: {
  pool: LpPoolDoc | null
  positions: LpPositionDoc[]
  bands: LpBandDoc[]
}): SyntheticDepthLevel[] {
  if (!args.pool || args.pool.totalShares <= 0n || args.pool.accountingNav <= 0n) return []

  const positionsByOwner = new Map<string, bigint>()
  for (const position of args.positions) positionsByOwner.set(position.owner, position.shares)

  const levels = new Map<string, SyntheticDepthLevel>()

  for (const band of args.bands) {
    const ownerShares = positionsByOwner.get(band.owner) ?? 0n
    if (ownerShares <= 0n) continue

    const ownerNav =
      (args.pool.accountingNav * ownerShares) / args.pool.totalShares

    for (const level of [
      {
        spreadBps: band.firstBandSpreadBps,
        maxOracleDeviationBps: band.firstBandMaxOracleDeviationBps,
        maxInventoryBps: band.firstBandMaxInventoryBps,
        maxNotional: band.firstBandMaxNotional,
      },
      {
        spreadBps: band.secondBandSpreadBps,
        maxOracleDeviationBps: band.secondBandMaxOracleDeviationBps,
        maxInventoryBps: band.secondBandMaxInventoryBps,
        maxNotional: band.secondBandMaxNotional,
      },
      {
        spreadBps: band.thirdBandSpreadBps,
        maxOracleDeviationBps: band.thirdBandMaxOracleDeviationBps,
        maxInventoryBps: band.thirdBandMaxInventoryBps,
        maxNotional: band.thirdBandMaxNotional,
      },
    ]) {
      const inventoryCap = (ownerNav * BigInt(level.maxInventoryBps)) / 10_000n
      const usable = level.maxNotional < inventoryCap ? level.maxNotional : inventoryCap
      if (usable <= 0n) continue
      const key = `${level.spreadBps}:${level.maxOracleDeviationBps}:${level.maxInventoryBps}`
      const existing = levels.get(key)
      levels.set(key, {
        spreadBps: level.spreadBps,
        maxOracleDeviationBps: level.maxOracleDeviationBps,
        maxInventoryBps: level.maxInventoryBps,
        notional: (existing?.notional ?? 0n) + usable,
      })
    }
  }

  return [...levels.values()].sort((a, b) => a.spreadBps - b.spreadBps)
}

function quoteFromDepth(args: {
  oraclePrice: bigint
  desiredNotional: bigint
  side: "long" | "short"
  depth: SyntheticDepthLevel[]
  fallbackSpreadBps: number
}): { execPrice: bigint; usedFallback: boolean } {
  if (args.desiredNotional <= 0n) {
    return { execPrice: args.oraclePrice, usedFallback: false }
  }
  let remaining = args.desiredNotional
  let weighted = 0n

  for (const level of args.depth) {
    if (remaining <= 0n) break
    const take = remaining < level.notional ? remaining : level.notional
    weighted += take * applySpread(args.oraclePrice, level.spreadBps, args.side)
    remaining -= take
  }

  if (remaining > 0n) {
    weighted += remaining * applySpread(args.oraclePrice, args.fallbackSpreadBps, args.side)
    remaining = 0n
    return { execPrice: weighted / args.desiredNotional, usedFallback: true }
  }

  return { execPrice: weighted / args.desiredNotional, usedFallback: false }
}

async function rpcCall<T>(args: {
  rpcUrl: string
  method: string
  params?: unknown[]
}): Promise<T> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: args.method,
    params: args.params ?? [],
  }

  const res = await fetch(args.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`RPC ${args.method} failed (${res.status})`)

  const json = (await res.json()) as { result?: T; error?: unknown }
  if (!("result" in json)) throw new Error(`RPC ${args.method} missing result`)
  return json.result as T
}

async function getNowSlot(rpcUrl: string): Promise<bigint> {
  const slot = await rpcCall<number>({ rpcUrl, method: "getSlot" })
  return BigInt(slot)
}

async function getAccountDataBase64(rpcUrl: string, address: string): Promise<string> {
  const result = await rpcCall<{
    value: { data: [string, string] } | null
  }>({
    rpcUrl,
    method: "getAccountInfo",
    params: [address, { encoding: "base64" }],
  })

  const value = result.value
  if (!value) throw new Error("Oracle account not found")

  const data = value.data
  const base64 = data[0]
  if (!base64) throw new Error("Oracle account had empty data")
  return base64
}

async function getOracleQuote(args: {
  rpcUrl: string
  oracleFeed: string
}): Promise<{
  nowSlot: bigint
  oraclePostedSlot: bigint
  oraclePrice: bigint
  oracleConf: bigint
}> {
  const [nowSlot, accountDataBase64] = await Promise.all([
    getNowSlot(args.rpcUrl),
    getAccountDataBase64(args.rpcUrl, args.oracleFeed),
  ])

  const bytes = decodeBase64(accountDataBase64)
  const parsed = getOraclePrice1e6FromPriceUpdateV2Bytes(bytes)
  if (!parsed) throw new Error("Invalid Pyth PriceUpdateV2 account data")

  const staleness = nowSlot - parsed.postedSlot
  if (staleness < 0n || staleness > MAX_ORACLE_STALENESS_SLOTS) {
    throw new Error(`Oracle is stale by ${staleness.toString(10)} slots`)
  }

  const maxConf = (parsed.price * MAX_ORACLE_CONFIDENCE_BPS) / 10_000n
  if (parsed.conf > maxConf) {
    throw new Error("Oracle confidence is too wide")
  }

  return {
    nowSlot,
    oraclePostedSlot: parsed.postedSlot,
    oraclePrice: parsed.price,
    oracleConf: parsed.conf,
  }
}

let cachedMatcher: {
  signer: string
  privateKey: CryptoKey
} | null = null

async function getMatcherPrivateKey(expectedSigner: string): Promise<CryptoKey> {
  if (cachedMatcher?.signer === expectedSigner) return cachedMatcher.privateKey

  const raw = process.env.MATCHER_KEYPAIR_JSON
  if (!raw) throw new Error("MATCHER_KEYPAIR_JSON is not set")

  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error("MATCHER_KEYPAIR_JSON must be a JSON array")

  const bytes = new Uint8Array(parsed.map((n) => Number(n)))
  if (bytes.length !== 64) throw new Error("MATCHER_KEYPAIR_JSON must be 64 bytes")

  const pubkey = bs58.encode(bytes.slice(32, 64))
  if (pubkey !== expectedSigner) throw new Error("Matcher signer mismatch")

  const privateKey = await createPrivateKeyFromBytes(bytes.slice(0, 32))
  cachedMatcher = { signer: expectedSigner, privateKey }
  return privateKey
}

export const getQuote = actionGeneric({
  args: {
    oracleFeed: v.string(),
    rpcUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rpcUrl =
      args.rpcUrl ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com"

    try {
      const quote = await getOracleQuote({ rpcUrl, oracleFeed: args.oracleFeed })

      return {
        nowSlot: quote.nowSlot.toString(),
        oraclePostedSlot: quote.oraclePostedSlot.toString(),
        oraclePrice: quote.oraclePrice.toString(),
        execPrice: quote.oraclePrice.toString(),
      }
    } catch (error) {
      await ctx.runMutation(insertMatcherError, {
        kind: "getQuote",
        message: error instanceof Error ? error.message : "Unknown matcher error",
        oracleFeed: args.oracleFeed,
        rpcUrl,
      })
      throw error
    }
  },
})

export const getHybridQuote = actionGeneric({
  args: {
    market: v.string(),
    shard: v.string(),
    oracleFeed: v.string(),
    desiredNotional: v.optional(v.string()),
    sizeQ: v.optional(v.string()),
    side: v.union(v.literal("long"), v.literal("short")),
    rpcUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rpcUrl =
      args.rpcUrl ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com"

    try {
      const quote = await getOracleQuote({ rpcUrl, oracleFeed: args.oracleFeed })
      const pool = (await ctx.runQuery(getLpPoolByShard, {
        shard: args.shard,
      })) as unknown as LpPoolDoc | null
      const bands = pool
        ? ((await ctx.runQuery(listLpBandsByPool, {
            lpPool: pool.lpPool,
          })) as unknown as LpBandDoc[])
        : []
      const positions = pool
        ? ((await ctx.runQuery(listLpPositionsByPool, {
            lpPool: pool.lpPool,
          })) as unknown as LpPositionDoc[])
        : []
      const normalizedPool = pool
        ? {
            ...pool,
            totalShares: normalizeBigInt(pool.totalShares),
            accountingNav: normalizeBigInt(pool.accountingNav),
          }
        : null
      const normalizedPositions = positions.map((position) => ({
        ...position,
        shares: normalizeBigInt(position.shares),
      }))
      const normalizedBands = bands.map((band) => ({
        ...band,
        firstBandMaxNotional: normalizeBigInt(band.firstBandMaxNotional),
        secondBandMaxNotional: normalizeBigInt(band.secondBandMaxNotional),
        thirdBandMaxNotional: normalizeBigInt(band.thirdBandMaxNotional),
      }))
      const depth = buildSyntheticDepth({
        pool: normalizedPool,
        positions: normalizedPositions,
        bands: normalizedBands,
      })
      const desiredNotional =
        args.desiredNotional != null
          ? normalizeBigInt(args.desiredNotional)
          : args.sizeQ != null
            ? (normalizeBigInt(args.sizeQ) * quote.oraclePrice) / 1_000_000n
            : 0n
      const { execPrice, usedFallback } = quoteFromDepth({
        oraclePrice: quote.oraclePrice,
        desiredNotional,
        side: args.side,
        depth,
        fallbackSpreadBps: 50,
      })

      return {
        nowSlot: quote.nowSlot.toString(),
        oraclePostedSlot: quote.oraclePostedSlot.toString(),
        oraclePrice: quote.oraclePrice.toString(),
        execPrice: execPrice.toString(),
        usedFallback,
        depth: depth.map((level) => ({
          spreadBps: level.spreadBps,
          maxOracleDeviationBps: level.maxOracleDeviationBps,
          maxInventoryBps: level.maxInventoryBps,
          notional: level.notional.toString(),
        })),
      }
    } catch (error) {
      await ctx.runMutation(insertMatcherError, {
        kind: "getHybridQuote",
        message: error instanceof Error ? error.message : "Unknown matcher error",
        oracleFeed: args.oracleFeed,
        rpcUrl,
      })
      throw error
    }
  },
})

export const signTransactions = actionGeneric({
  args: {
    signer: v.string(),
    oracleFeed: v.string(),
    lastCrankSlot: v.int64(),
    willCrank: v.optional(v.boolean()),
    messageBase64s: v.array(v.string()),
    rpcUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rpcUrl =
      args.rpcUrl ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com"

    try {
      const nowSlot = await getNowSlot(rpcUrl)
      if (!args.willCrank) {
        const staleness = nowSlot - args.lastCrankSlot
        if (staleness < 0n || staleness > MAX_CRANK_STALENESS_SLOTS) {
          throw new Error(`Crank is stale by ${staleness.toString(10)} slots`)
        }
      }

      // Ensure oracle is usable right now.
      await getOracleQuote({ rpcUrl, oracleFeed: args.oracleFeed })

      const privateKey = await getMatcherPrivateKey(args.signer)

      const signaturesBase64 = []
      for (const messageBase64 of args.messageBase64s) {
        const messageBytes = decodeBase64(messageBase64)
        const sig = await signBytes(privateKey, messageBytes)
        signaturesBase64.push(Buffer.from(sig).toString("base64"))
      }

      return { signer: args.signer, signaturesBase64 }
    } catch (error) {
      await ctx.runMutation(insertMatcherError, {
        kind: "signTransactions",
        message: error instanceof Error ? error.message : "Unknown matcher error",
        signer: args.signer,
        oracleFeed: args.oracleFeed,
        rpcUrl,
      })
      throw error
    }
  },
})


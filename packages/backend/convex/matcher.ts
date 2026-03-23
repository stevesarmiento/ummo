"use node"

import { actionGeneric, makeFunctionReference } from "convex/server"
import { v } from "convex/values"
import bs58 from "bs58"

import { createPrivateKeyFromBytes, signBytes } from "@solana/keys"

import { decodeBase64 } from "./lib/quasar_events"
import { getOraclePrice1e6FromPriceUpdateV2Bytes } from "./lib/pyth_receiver"

const MAX_CRANK_STALENESS_SLOTS = 150n
const MAX_ORACLE_STALENESS_SLOTS = 150n
const MAX_ORACLE_CONFIDENCE_BPS = 200n

const insertMatcherError = makeFunctionReference<"mutation">("matcherErrors:insert")

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


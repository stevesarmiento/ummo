import { readFile } from "node:fs/promises"
import process from "node:process"

import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithinSizeLimit,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
} from "@solana/kit"
import { createKeyPairSignerFromBytes } from "@solana/signers"
import { assertIsTransactionWithBlockhashLifetime } from "@solana/transactions"

import { getInitMarketInstruction, getMarketAddress } from "@ummo/sdk"

const DEFAULT_RPC_URL = "https://api.devnet.solana.com"
const DEFAULT_PAYER_PATH = "~/.config/solana/id.json"
const PYTH_RECEIVER_PROGRAM_ID = address(
  "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ",
)

function wsUrlFromHttpUrl(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) return `wss://${httpUrl.slice("https://".length)}`
  if (httpUrl.startsWith("http://")) return `ws://${httpUrl.slice("http://".length)}`
  return httpUrl
}

function resolveHomePath(value: string): string {
  if (!value.startsWith("~/")) return value
  const home = process.env.HOME
  if (!home) throw new Error("HOME is not set; cannot resolve ~")
  return `${home}/${value.slice("~/".length)}`
}

function parseArgs(argv: readonly string[]): Map<string, string | true> {
  const out = new Map<string, string | true>()
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i]
    if (!token) continue

    if (token === "-h" || token === "--help") {
      out.set("help", true)
      continue
    }

    if (!token.startsWith("--")) continue
    const raw = token.slice(2)
    const eq = raw.indexOf("=")
    if (eq !== -1) {
      const k = raw.slice(0, eq)
      const v = raw.slice(eq + 1)
      if (k) out.set(k, v)
      continue
    }

    const k = raw
    const next = argv[i + 1]
    if (next && !next.startsWith("--")) {
      out.set(k, next)
      i++
      continue
    }

    out.set(k, true)
  }
  return out
}

function getStringArg(
  args: Map<string, string | true>,
  key: string,
): string | null {
  const value = args.get(key)
  if (!value || value === true) return null
  return value
}

function getRequiredStringArg(
  args: Map<string, string | true>,
  key: string,
): string {
  const value = getStringArg(args, key)
  if (!value) throw new Error(`Missing --${key}`)
  return value
}

function parseU64(value: string, argName: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error(`${argName} must be a base-10 unsigned integer`)
  const n = BigInt(value)
  if (n < 0n || n > 18_446_744_073_709_551_615n) {
    throw new Error(`${argName} out of range`)
  }
  return n
}

async function convexAction<T>(args: {
  convexUrl: string
  path: string
  args: Record<string, unknown>
}): Promise<T> {
  const res = await fetch(`${args.convexUrl}/api/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: args.path, args: args.args, format: "json" }),
  })

  if (!res.ok) throw new Error(`Convex action failed (${res.status})`)
  const json = (await res.json()) as
    | { status: "success"; value: T }
    | { status: "error"; errorMessage: string }

  if (json.status === "success") return json.value
  throw new Error(json.errorMessage ?? "Convex action failed")
}

function printHelp(): void {
  // Keep this copy/paste-friendly: no ANSI, no tables.
  console.log(
    [
      "Usage:",
      "  bun run init-market --oracle-feed <pubkey> --matcher-authority <pubkey> [options]",
      "",
      "Required:",
      "  --oracle-feed         PriceUpdateV2 account pubkey (must exist on devnet)",
      "  --matcher-authority   Pubkey that will co-sign trades (must match backend MATCHER_KEYPAIR_JSON)",
      "",
      "Optional:",
      `  --rpc                 RPC URL (default: ${DEFAULT_RPC_URL})`,
      "  --convex              Convex deployment URL (default: $NEXT_PUBLIC_CONVEX_URL)",
      `  --payer               Path to payer keypair JSON (default: ${DEFAULT_PAYER_PATH})`,
      "  --collateral-mint     USDC mint (default: devnet USDC)",
      "  --market-id           u64 market id (default: 0)",
      "",
      "Example:",
      "  bun run init-market \\",
      "    --rpc \"https://api.devnet.solana.com\" \\",
      "    --convex \"$NEXT_PUBLIC_CONVEX_URL\" \\",
      "    --payer \"$HOME/.config/solana/id.json\" \\",
      "    --oracle-feed \"<PriceUpdateV2_account_pubkey>\" \\",
      "    --collateral-mint \"4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU\" \\",
      "    --matcher-authority \"<matcher_pubkey>\" \\",
      "    --market-id 0",
      "",
    ].join("\n"),
  )
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.has("help")) {
    printHelp()
    return
  }

  const rpcUrl =
    getStringArg(args, "rpc") ??
    process.env.SOLANA_RPC_URL ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    DEFAULT_RPC_URL

  const convexUrl =
    getStringArg(args, "convex") ??
    process.env.NEXT_PUBLIC_CONVEX_URL ??
    null
  if (!convexUrl) throw new Error("Missing --convex (or NEXT_PUBLIC_CONVEX_URL)")

  const payerPath = resolveHomePath(
    getStringArg(args, "payer") ?? DEFAULT_PAYER_PATH,
  )

  const oracleFeedAddress = address(getRequiredStringArg(args, "oracle-feed"))
  const collateralMintAddress = address(
    getStringArg(args, "collateral-mint") ??
      "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  )
  const matcherAuthorityAddress = address(
    getRequiredStringArg(args, "matcher-authority"),
  )

  const marketId = parseU64(getStringArg(args, "market-id") ?? "0", "market-id")
  const payerBytesRaw = await readFile(payerPath, "utf-8")
  const payerParsed = JSON.parse(payerBytesRaw) as unknown
  if (!Array.isArray(payerParsed)) throw new Error("payer keypair must be a JSON array")

  const payerBytes = new Uint8Array(payerParsed.map((n) => Number(n)))
  if (payerBytes.length !== 64) throw new Error("payer keypair must be 64 bytes")

  const payerSigner = await createKeyPairSignerFromBytes(payerBytes)

  const rpc = createSolanaRpc(rpcUrl)
  const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrlFromHttpUrl(rpcUrl))

  // Fail fast if the oracle feed does not exist (init_market itself does not validate this).
  const oracleAccount = await rpc
    .getAccountInfo(oracleFeedAddress, { encoding: "base64" })
    .send()
  if (!oracleAccount.value) {
    throw new Error(
      [
        "Oracle feed account not found.",
        "Pass a real PriceUpdateV2 account pubkey (owned by Pyth receiver) on this cluster.",
      ].join(" "),
    )
  }
  if (oracleAccount.value.owner !== PYTH_RECEIVER_PROGRAM_ID) {
    throw new Error(
      `Oracle feed owner mismatch (expected ${PYTH_RECEIVER_PROGRAM_ID}, got ${oracleAccount.value.owner})`,
    )
  }

  const market = await getMarketAddress({ oracleFeed: oracleFeedAddress })
  const ixs: Instruction[] = [
    getInitMarketInstruction({
      payer: payerSigner.address,
      collateralMint: collateralMintAddress,
      oracleFeed: oracleFeedAddress,
      matcherAuthority: matcherAuthorityAddress,
      market,
      marketId,
    }),
  ]

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()
  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(payerSigner, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(ixs, tx),
  )

  const signedTransaction = await signTransactionMessageWithSigners(
    transactionMessage,
  )
  assertIsTransactionWithBlockhashLifetime(signedTransaction)
  assertIsTransactionWithinSizeLimit(signedTransaction)

  await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
    commitment: "confirmed",
  })

  const signature = getSignatureFromTransaction(signedTransaction)

  await convexAction({
    convexUrl,
    path: "indexer:indexTransaction",
    args: { signature, rpcUrl },
  })

  console.log(
    [
      "",
      "Initialized market + indexed into Convex.",
      `- signature: ${signature}`,
      `- market: ${market}`,
      "",
      "Next:",
      "- Open `/markets` in the web app and refresh.",
      `- Or go directly to: /markets/${encodeURIComponent(market)}`,
      "",
    ].join("\n"),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})


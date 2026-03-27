import * as anchor from "@coral-xyz/anchor"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Connection, Keypair, PublicKey } from "@solana/web3.js"

function getArg(name: string): string | null {
  const argv = process.argv.slice(2)
  const idx = argv.indexOf(name)
  if (idx === -1) return null
  return argv[idx + 1] ?? null
}

function loadKeypair(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, "utf8")
  const secret = Uint8Array.from(JSON.parse(raw) as number[])
  return Keypair.fromSecretKey(secret)
}

const DEFAULT_RPC_URL = "https://api.devnet.solana.com"
const DEFAULT_ORACLE_FEED = "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE" // price_update account (Pyth receiver)

function extractSimLogs(response: unknown): string[] {
  if (!response || typeof response !== "object") return []
  const anyResponse = response as any
  if (Array.isArray(anyResponse.value?.logs)) return anyResponse.value.logs
  if (Array.isArray(anyResponse.raw?.value?.logs)) return anyResponse.raw.value.logs
  if (Array.isArray(anyResponse.raw?.logs)) return anyResponse.raw.logs
  if (Array.isArray(anyResponse.logs)) return anyResponse.logs
  return []
}

async function main() {
  const rpcUrl = getArg("--rpc-url") ?? process.env.SOLANA_RPC_URL ?? DEFAULT_RPC_URL
  const walletPath =
    getArg("--wallet") ??
    process.env.ANCHOR_WALLET ??
    process.env.SOLANA_WALLET ??
    path.join(os.homedir(), ".config/solana/id.json")

  const oracleFeed = new PublicKey(
    getArg("--oracle-feed") ?? process.env.UMMO_ORACLE_FEED ?? DEFAULT_ORACLE_FEED,
  )

  const payerKeypair = loadKeypair(walletPath)
  const connection = new Connection(rpcUrl, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  })
  const wallet = new anchor.Wallet(payerKeypair)
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  })
  anchor.setProvider(provider)

  const idlPath =
    getArg("--idl") ?? process.env.UMMO_IDL_PATH ?? path.join("target", "idl", "ummo_market.json")
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"))
  const program = new anchor.Program(idl as never, provider)
  const programId = program.programId

  const [market] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), oracleFeed.toBuffer()],
    programId,
  )
  const [shard] = PublicKey.findProgramAddressSync(
    [Buffer.from("shard"), market.toBuffer(), oracleFeed.toBuffer()],
    programId,
  )
  const [engine] = PublicKey.findProgramAddressSync(
    [Buffer.from("engine"), shard.toBuffer()],
    programId,
  )
  const [riskState] = PublicKey.findProgramAddressSync(
    [Buffer.from("risk_state"), shard.toBuffer()],
    programId,
  )

  const result = await program.methods
    // now_slot/oracle_price are ignored; program reads Clock + oracle account.
    .keeperCrank(new anchor.BN(0), new anchor.BN(0), [], 0)
    .accounts({
      signer: payerKeypair.publicKey,
      oracleFeed,
      market,
      shard,
      engine,
      riskState,
    })
    .simulate()

  const logs = extractSimLogs(result)
  console.log(
    JSON.stringify(
      {
        rpcUrl,
        wallet: payerKeypair.publicKey.toBase58(),
        programId: programId.toBase58(),
        oracleFeed: oracleFeed.toBase58(),
        market: market.toBase58(),
        shard: shard.toBase58(),
        engine: engine.toBase58(),
        riskState: riskState.toBase58(),
        logs,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})


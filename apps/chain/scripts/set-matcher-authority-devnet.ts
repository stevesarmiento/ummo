import * as anchor from "@coral-xyz/anchor"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Keypair, PublicKey, SystemProgram, Connection } from "@solana/web3.js"

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

async function main() {
  const rpcUrl =
    getArg("--rpc-url") ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com"
  const walletPath =
    getArg("--wallet") ??
    process.env.ANCHOR_WALLET ??
    process.env.SOLANA_WALLET ??
    path.join(os.homedir(), ".config/solana/id.json")

  const oracleFeed = getArg("--oracle-feed")
  if (!oracleFeed) throw new Error("Missing --oracle-feed")

  const market = getArg("--market")
  if (!market) throw new Error("Missing --market")

  const newMatcherAuthority =
    getArg("--new-matcher-authority") ??
    (() => {
      const keypairPath = getArg("--new-matcher-keypair")
      if (!keypairPath) return null
      return loadKeypair(keypairPath).publicKey.toBase58()
    })()
  if (!newMatcherAuthority)
    throw new Error("Missing --new-matcher-authority (or --new-matcher-keypair)")

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

  const signature = await program.methods
    .setMatcherAuthority()
    .accounts({
      signer: payerKeypair.publicKey,
      oracleFeed: new PublicKey(oracleFeed),
      market: new PublicKey(market),
      newMatcherAuthority: new PublicKey(newMatcherAuthority),
    })
    .rpc()

  console.log(
    JSON.stringify(
      {
        signature,
        programId: program.programId.toBase58(),
        market,
        oracleFeed,
        newMatcherAuthority,
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


import * as anchor from "@coral-xyz/anchor"
import BN from "bn.js"
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

function getFlag(name: string): boolean {
  return process.argv.slice(2).includes(name)
}

function loadKeypair(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, "utf8")
  const secret = Uint8Array.from(JSON.parse(raw) as number[])
  return Keypair.fromSecretKey(secret)
}

const DEFAULT_RPC_URL = "https://api.devnet.solana.com"
const DEFAULT_COLLATERAL_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" // devnet USDC
const DEFAULT_ORACLE_FEED = "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE" // price_update account (Pyth receiver)

async function main() {
  const rpcUrl = getArg("--rpc-url") ?? process.env.SOLANA_RPC_URL ?? DEFAULT_RPC_URL
  const walletPath =
    getArg("--wallet") ??
    process.env.ANCHOR_WALLET ??
    process.env.SOLANA_WALLET ??
    path.join(os.homedir(), ".config/solana/id.json")

  const collateralMint = new PublicKey(
    getArg("--collateral-mint") ??
      process.env.UMMO_COLLATERAL_MINT ??
      DEFAULT_COLLATERAL_MINT,
  )
  const oracleFeed = new PublicKey(
    getArg("--oracle-feed") ?? process.env.UMMO_ORACLE_FEED ?? DEFAULT_ORACLE_FEED,
  )
  const matcherAuthority = new PublicKey(
    getArg("--matcher-authority") ??
      process.env.UMMO_MATCHER_AUTHORITY ??
      loadKeypair(walletPath).publicKey.toBase58(),
  )

  const marketId = BigInt(getArg("--market-id") ?? process.env.UMMO_MARKET_ID ?? "1")
  const shardId = Number(getArg("--shard-id") ?? process.env.UMMO_SHARD_ID ?? "1")

  const U64_MIN = BigInt(0)
  const U64_MAX = BigInt("18446744073709551615")
  if (marketId < U64_MIN || marketId > U64_MAX)
    throw new Error("--market-id out of range for u64")
  if (!Number.isInteger(shardId) || shardId < 0 || shardId > 65_535)
    throw new Error("--shard-id out of range for u16")

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
  // Anchor 0.32 expects the v1 IDL shape (program id embedded in the IDL).
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
  const [rails] = PublicKey.findProgramAddressSync(
    [Buffer.from("rails"), shard.toBuffer()],
    programId,
  )
  const [lpPool] = PublicKey.findProgramAddressSync(
    [Buffer.from("lp_pool"), shard.toBuffer()],
    programId,
  )
  const [matcherAllowlist] = PublicKey.findProgramAddressSync(
    [Buffer.from("matcher_allowlist"), market.toBuffer()],
    programId,
  )

  const collateralMintInfo = await connection.getAccountInfo(collateralMint, "confirmed")
  if (!collateralMintInfo) throw new Error(`collateralMint ${collateralMint.toBase58()} not found`)
  const oracleFeedInfo = await connection.getAccountInfo(oracleFeed, "confirmed")
  if (!oracleFeedInfo) throw new Error(`oracleFeed ${oracleFeed.toBase58()} not found`)

  if (getFlag("--dry-run")) {
    console.log(
      JSON.stringify(
        {
          rpcUrl,
          wallet: payerKeypair.publicKey.toBase58(),
          programId: programId.toBase58(),
          collateralMint: collateralMint.toBase58(),
          oracleFeed: oracleFeed.toBase58(),
          matcherAuthority: matcherAuthority.toBase58(),
          marketId: marketId.toString(),
          shardId,
          derived: {
            market: market.toBase58(),
            shard: shard.toBase58(),
            engine: engine.toBase58(),
            riskState: riskState.toBase58(),
            rails: rails.toBase58(),
            lpPool: lpPool.toBase58(),
            shardSeed: oracleFeed.toBase58(),
          },
        },
        null,
        2,
      ),
    )
    return
  }

  const initMarketSig = await program.methods
    .initMarket(new BN(marketId.toString()))
    .accounts({
      payer: payerKeypair.publicKey,
      collateralMint,
      oracleFeed,
      matcherAuthority,
      market,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  // Create the matcher allowlist PDA (disabled by default) so `execute_trade`
  // always has enough account keys even when allowlisting isn't enabled.
  const setMatcherAllowlistSig = await program.methods
    .setMatcherAllowlist(false, [])
    .accounts({
      authority: payerKeypair.publicKey,
      oracleFeed,
      market,
      matcherAllowlist,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  const initShardSig = await program.methods
    .initShard(shardId)
    .accounts({
      payer: payerKeypair.publicKey,
      oracleFeed,
      market,
      shardSeed: oracleFeed,
      shard,
      riskState,
      rails,
      engine,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  const initLpPoolSig = await program.methods
    .initLpPool()
    .accounts({
      payer: payerKeypair.publicKey,
      oracleFeed,
      market,
      shard,
      lpPool,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  console.log(
    JSON.stringify(
      {
        programId: programId.toBase58(),
        market: market.toBase58(),
        shard: shard.toBase58(),
        engine: engine.toBase58(),
        lpPool: lpPool.toBase58(),
        collateralMint: collateralMint.toBase58(),
        oracleFeed: oracleFeed.toBase58(),
        matcherAuthority: matcherAuthority.toBase58(),
        matcherAllowlist: matcherAllowlist.toBase58(),
        signatures: {
          initMarket: initMarketSig,
          setMatcherAllowlist: setMatcherAllowlistSig,
          initShard: initShardSig,
          initLpPool: initLpPoolSig,
        },
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


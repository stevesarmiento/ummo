import assert from "node:assert/strict";
import fs from "node:fs";

import * as anchor from "@coral-xyz/anchor";
import type { Idl, Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

const ENGINE_SEED = Buffer.from("engine");
const LP_BAND_SEED = Buffer.from("lp_band");
const LP_POOL_SEED = Buffer.from("lp_pool");
const MARKET_SEED = Buffer.from("market");
const RAILS_SEED = Buffer.from("rails");
const RISK_STATE_SEED = Buffer.from("risk_state");
const SHARD_SEED = Buffer.from("shard");
const TRADER_SEED = Buffer.from("trader");
const USDC_ONE = new BN(1_000_000);

function derivePda(seeds: Buffer[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

describe("ummo_market", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = provider.wallet as anchor.Wallet;
  const idl = JSON.parse(
    fs.readFileSync("target/idl/ummo_market.json", "utf8")
  ) as Idl;
  const program = new anchor.Program(idl, provider) as Program<Idl> & any;

  it("runs market, shard, trader, and LP band setup flows", async () => {
    const collateralMint = Keypair.generate();
    const oracleFeed = wallet.publicKey;
    const shardSeed = Keypair.generate().publicKey;

    const market = derivePda(
      [MARKET_SEED, oracleFeed.toBuffer()],
      program.programId
    );
    const shard = derivePda(
      [SHARD_SEED, market.toBuffer(), shardSeed.toBuffer()],
      program.programId
    );
    const engine = derivePda(
      [ENGINE_SEED, shard.toBuffer()],
      program.programId
    );
    const riskState = derivePda(
      [RISK_STATE_SEED, shard.toBuffer()],
      program.programId
    );
    const rails = derivePda(
      [RAILS_SEED, shard.toBuffer()],
      program.programId
    );
    const trader = derivePda(
      [TRADER_SEED, shard.toBuffer(), wallet.publicKey.toBuffer()],
      program.programId
    );
    const lpPool = derivePda(
      [LP_POOL_SEED, shard.toBuffer()],
      program.programId
    );
    const lpBandConfig = derivePda(
      [LP_BAND_SEED, lpPool.toBuffer(), wallet.publicKey.toBuffer()],
      program.programId
    );

    const rentForMint =
      await provider.connection.getMinimumBalanceForRentExemption(82);
    const userCollateral = getAssociatedTokenAddressSync(
      collateralMint.publicKey,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const setupTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: collateralMint.publicKey,
        lamports: rentForMint,
        space: 82,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        collateralMint.publicKey,
        6,
        wallet.publicKey,
        null,
        TOKEN_PROGRAM_ID
      ),
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        userCollateral,
        wallet.publicKey,
        collateralMint.publicKey,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      createMintToInstruction(
        collateralMint.publicKey,
        userCollateral,
        wallet.publicKey,
        500_000_000,
        [],
        TOKEN_PROGRAM_ID
      )
    );
    await provider.sendAndConfirm(setupTx, [collateralMint]);

    await program.methods
      .initMarket(new BN(42))
      .accounts({
        payer: wallet.publicKey,
        collateralMint: collateralMint.publicKey,
        oracleFeed,
        matcherAuthority: wallet.publicKey,
        market,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .initShard(7)
      .accounts({
        payer: wallet.publicKey,
        oracleFeed,
        market,
        shardSeed,
        shard,
        riskState,
        rails,
        engine,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .openTrader()
      .accounts({
        signer: wallet.publicKey,
        oracleFeed,
        market,
        shard,
        engine,
        trader,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .initLpPool()
      .accounts({
        payer: wallet.publicKey,
        oracleFeed,
        market,
        shard,
        lpPool,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .setLpBandConfig([
        {
          maxNotional: new BN(250).mul(USDC_ONE),
          maxOracleDeviationBps: 40,
          spreadBps: 8,
          maxInventoryBps: 2500,
        },
        {
          maxNotional: new BN(500).mul(USDC_ONE),
          maxOracleDeviationBps: 75,
          spreadBps: 15,
          maxInventoryBps: 3500,
        },
        {
          maxNotional: new BN(1000).mul(USDC_ONE),
          maxOracleDeviationBps: 120,
          spreadBps: 30,
          maxInventoryBps: 4500,
        },
      ])
      .accounts({
        owner: wallet.publicKey,
        oracleFeed,
        market,
        shard,
        lpPool,
        lpBandConfig,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const traderAccount = await program.account.trader.fetch(trader);
    assert.equal(traderAccount.owner.toBase58(), wallet.publicKey.toBase58());
    assert.equal(traderAccount.market.toBase58(), market.toBase58());

    const poolAccount = await program.account.lpPool.fetch(lpPool);
    assert.equal(poolAccount.market.toBase58(), market.toBase58());
    assert.equal(poolAccount.totalShares.toString(), "0");

    const lpBandAccount = await program.account.lpBandConfig.fetch(
      lpBandConfig
    );
    assert.equal(lpBandAccount.owner.toBase58(), wallet.publicKey.toBase58());
    assert.equal(lpBandAccount.bands[0].spreadBps, 8);
  });
});

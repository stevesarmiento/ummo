import * as anchor from "@coral-xyz/anchor";
import type { Idl, Program } from "@coral-xyz/anchor";

describe("ummo_market", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace["ummo_market"] as Program<Idl>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initMarket(new anchor.BN(0)).rpc();
    console.log("Your transaction signature", tx);
  });
});

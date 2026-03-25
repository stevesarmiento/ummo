use quasar_lang::prelude::*;

use crate::{
    account_init::init_pda_account,
    engine::{add_house_lp, init_engine},
    errors::UmmoError,
    events::ShardInitialized,
    state::{MarketConfig, MarketShard, ShardEngine, ENGINE_SEED, MARKET_SEED, SHARD_SEED},
};

#[derive(Accounts)]
pub struct InitShard<'info> {
    #[account(mut)]
    pub payer: &'info Signer,

    pub oracle_feed: &'info UncheckedAccount,

    #[account(seeds = [MARKET_SEED, oracle_feed], bump = market.bump)]
    pub market: &'info Account<MarketConfig>,

    pub shard_seed: &'info UncheckedAccount,

    #[account(mut, seeds = [SHARD_SEED, market, shard_seed], bump)]
    pub shard: &'info UncheckedAccount,

    #[account(mut, seeds = [ENGINE_SEED, shard], bump)]
    pub engine: &'info UncheckedAccount,

    pub system_program: &'info Program<System>,
    pub clock: &'info Sysvar<Clock>,
}

impl<'info> InitShard<'info> {
    #[inline(always)]
    pub fn init_shard(
        &mut self,
        shard_id: u16,
        bumps: &InitShardBumps,
    ) -> Result<(), ProgramError> {
        require_keys_eq!(self.market.authority, *self.payer.address(), UmmoError::Unauthorized);

        let created_at_slot = self.clock.slot.get();
        let shard_address = *self.shard.address();
        let shard_bump = [bumps.shard];
        let engine_bump = [bumps.engine];
        let shard_seeds = [
            Seed::from(SHARD_SEED),
            Seed::from(self.market.address().as_ref()),
            Seed::from(self.shard_seed.address().as_ref()),
            Seed::from(&shard_bump),
        ];
        let engine_seeds = [
            Seed::from(ENGINE_SEED),
            Seed::from(shard_address.as_ref()),
            Seed::from(&engine_bump),
        ];
        let shard = init_pda_account::<MarketShard>(
            self.system_program,
            self.payer,
            self.shard,
            &shard_seeds,
        )?;
        let engine = init_pda_account::<ShardEngine>(
            self.system_program,
            self.payer,
            self.engine,
            &engine_seeds,
        )?;

        shard.market = *self.market.address();
        shard.bump = bumps.shard;
        shard.shard_id = PodU16::from(shard_id);
        shard.shard_seed = *self.shard_seed.address();
        init_engine(engine);
        shard.house_engine_index = PodU16::from(add_house_lp(engine, &self.market.matcher_authority)?);
        shard.created_at_slot = self.clock.slot;
        shard.last_crank_slot = self.clock.slot;

        emit!(ShardInitialized {
            market: *self.market.address(),
            shard: shard_address,
            authority: *self.payer.address(),
            shard_seed: *self.shard_seed.address(),
            shard_id,
            house_engine_index: shard.house_engine_index.get(),
            __pad0: 0,
            created_at_slot,
            last_crank_slot: created_at_slot,
        });

        Ok(())
    }
}


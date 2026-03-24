use quasar_lang::prelude::*;

use crate::{
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

    #[account(mut, init, payer = payer, seeds = [SHARD_SEED, market, shard_seed], bump)]
    pub shard: &'info mut Account<MarketShard>,

    #[account(mut, init, payer = payer, seeds = [ENGINE_SEED, shard], bump)]
    pub engine: &'info mut Account<ShardEngine>,

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

        self.shard.market = *self.market.address();
        self.shard.bump = bumps.shard;
        self.shard.shard_id = PodU16::from(shard_id);
        self.shard.shard_seed = *self.shard_seed.address();
        init_engine(self.engine);
        self.shard.house_engine_index = PodU16::from(add_house_lp(self.engine, &self.market.matcher_authority)?);
        self.shard.created_at_slot = self.clock.slot;
        self.shard.last_crank_slot = self.clock.slot;

        emit!(ShardInitialized {
            market: *self.market.address(),
            shard: *self.shard.address(),
            authority: *self.payer.address(),
            shard_seed: *self.shard_seed.address(),
            shard_id,
            house_engine_index: self.shard.house_engine_index.get(),
            __pad0: 0,
            created_at_slot,
            last_crank_slot: created_at_slot,
        });

        Ok(())
    }
}


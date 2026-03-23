use quasar_lang::prelude::*;

use crate::{
    events::MarketInitialized,
    events::ShardInitialized,
    engine::{add_house_lp, init_engine},
    state::{MarketConfig, MarketShard, ShardEngine, ENGINE_SEED, MARKET_SEED, SHARD_SEED},
};

#[derive(Accounts)]
pub struct InitMarket<'info> {
    #[account(mut)]
    pub payer: &'info mut Signer,

    pub collateral_mint: &'info UncheckedAccount,
    pub oracle_feed: &'info UncheckedAccount,
    pub matcher_authority: &'info UncheckedAccount,

    #[account(init, payer = payer, seeds = [MARKET_SEED, oracle_feed], bump)]
    pub market: &'info mut Account<MarketConfig>,

    #[account(init, payer = payer, seeds = [SHARD_SEED, market, oracle_feed], bump)]
    pub shard: &'info mut Account<MarketShard>,

    #[account(init, payer = payer, seeds = [ENGINE_SEED, shard], bump)]
    pub engine: &'info mut Account<ShardEngine>,

    pub system_program: &'info Program<System>,
    pub clock: &'info Sysvar<Clock>,
}

impl<'info> InitMarket<'info> {
    #[inline(always)]
    pub fn init_market(&mut self, market_id: u64, shard_id: u16, bumps: &InitMarketBumps) -> Result<(), ProgramError> {
        let created_at_slot = self.clock.slot.get();
        self.market.authority = *self.payer.address();
        self.market.bump = bumps.market;
        self.market.market_id = PodU64::from(market_id);
        self.market.collateral_mint = *self.collateral_mint.address();
        self.market.oracle_feed = *self.oracle_feed.address();
        self.market.matcher_authority = *self.matcher_authority.address();
        self.market.created_at_slot = self.clock.slot;

        self.shard.market = *self.market.address();
        self.shard.bump = bumps.shard;
        self.shard.shard_id = PodU16::from(shard_id);
        self.shard.shard_seed = *self.oracle_feed.address();
        init_engine(self.engine);
        self.shard.house_engine_index = PodU16::from(add_house_lp(self.engine, self.matcher_authority.address())?);
        self.shard.created_at_slot = self.clock.slot;
        self.shard.last_crank_slot = self.clock.slot;

        emit!(MarketInitialized {
            market: *self.market.address(),
            shard: *self.shard.address(),
            authority: *self.payer.address(),
            collateral_mint: *self.collateral_mint.address(),
            oracle_feed: *self.oracle_feed.address(),
            matcher_authority: *self.matcher_authority.address(),
            market_id,
        });

        emit!(ShardInitialized {
            market: *self.market.address(),
            shard: *self.shard.address(),
            authority: *self.payer.address(),
            shard_seed: *self.oracle_feed.address(),
            shard_id,
            house_engine_index: self.shard.house_engine_index.get(),
            __pad0: 0,
            created_at_slot,
            last_crank_slot: created_at_slot,
        });

        Ok(())
    }
}


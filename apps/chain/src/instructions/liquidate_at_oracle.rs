use quasar_lang::prelude::*;

use crate::{
    engine::borrow_engine_mut,
    errors::UmmoError,
    events::LiquidationEvent,
    oracle::get_oracle_price_1e6,
    state::{MarketConfig, MarketShard, ShardEngine, ENGINE_SEED, MARKET_SEED},
};

#[derive(Accounts)]
pub struct LiquidateAtOracle<'info> {
    pub signer: &'info Signer,

    pub oracle_feed: &'info UncheckedAccount,

    #[account(seeds = [MARKET_SEED, oracle_feed], bump = market.bump)]
    pub market: &'info Account<MarketConfig>,

    pub shard: &'info Account<MarketShard>,

    #[account(mut, seeds = [ENGINE_SEED, shard], bump)]
    pub engine: &'info mut Account<ShardEngine>,

    pub clock: &'info Sysvar<Clock>,
}

impl<'info> LiquidateAtOracle<'info> {
    #[inline(always)]
    pub fn liquidate_at_oracle(&mut self, liquidatee_engine_idx: u16) -> Result<(), ProgramError> {
        require!(
            (liquidatee_engine_idx as usize) < percolator::MAX_ACCOUNTS,
            UmmoError::InvalidAmount
        );

        require_keys_eq!(self.shard.market, *self.market.address(), UmmoError::Unauthorized);

        let now_slot = self.clock.slot.get();
        let oracle = get_oracle_price_1e6(self.oracle_feed.to_account_view(), now_slot)?;

        let (liquidated, liquidatee_owner, old_effective_pos_q) = {
            let engine = borrow_engine_mut(self.engine);
            engine
                .require_fresh_crank(now_slot)
                .map_err(UmmoError::from)?;

            let idx = liquidatee_engine_idx as usize;
            let liquidatee_owner = Address::new_from_array(engine.accounts[idx].owner);
            let old_eff = engine.effective_pos_q(idx);
            let old_effective_pos_q =
                i64::try_from(old_eff).map_err(|_| UmmoError::InvalidAmount)?;

            let liquidated = engine
                .liquidate_at_oracle(liquidatee_engine_idx, now_slot, oracle.price)
                .map_err(UmmoError::from)?;

            (liquidated, liquidatee_owner, old_effective_pos_q)
        };

        emit!(LiquidationEvent {
            market: *self.market.address(),
            shard: *self.shard.address(),
            keeper: *self.signer.address(),
            liquidatee_owner,
            liquidatee_engine_index: liquidatee_engine_idx,
            liquidated,
            __pad0: 0,
            __pad1: 0,
            old_effective_pos_q,
            now_slot,
            oracle_price: oracle.price,
            oracle_posted_slot: oracle.posted_slot,
        });

        Ok(())
    }
}


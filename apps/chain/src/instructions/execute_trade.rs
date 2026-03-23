use quasar_lang::prelude::*;

use crate::{
    engine::borrow_engine_mut,
    errors::UmmoError,
    events::TradeExecuted,
    oracle::get_oracle_price_1e6,
    state::{MarketConfig, MarketShard, ShardEngine, Trader, ENGINE_SEED, MARKET_SEED, TRADER_SEED},
};

pub const MAX_EXEC_SLIPPAGE_BPS: u64 = 50;

#[derive(Accounts)]
pub struct ExecuteTrade<'info> {
    pub signer: &'info Signer,

    pub matcher: &'info Signer,

    pub oracle_feed: &'info UncheckedAccount,

    #[account(seeds = [MARKET_SEED, oracle_feed], bump = market.bump)]
    pub market: &'info Account<MarketConfig>,

    pub shard: &'info Account<MarketShard>,

    #[account(mut, seeds = [ENGINE_SEED, shard], bump)]
    pub engine: &'info mut Account<ShardEngine>,

    #[account(seeds = [TRADER_SEED, shard, signer], bump = trader.bump)]
    pub trader: &'info Account<Trader>,

    pub clock: &'info Sysvar<Clock>,
}

impl<'info> ExecuteTrade<'info> {
    #[inline(always)]
    pub fn execute_trade(&mut self, exec_price: u64, size_q: i64) -> Result<(), ProgramError> {
        require!(size_q != 0, UmmoError::InvalidAmount);
        require!(exec_price > 0, UmmoError::InvalidAmount);

        require_keys_eq!(self.shard.market, *self.market.address(), UmmoError::Unauthorized);
        require_keys_eq!(self.trader.owner, *self.signer.address(), UmmoError::Unauthorized);
        require_keys_eq!(self.trader.market, *self.market.address(), UmmoError::Unauthorized);
        require_keys_eq!(self.trader.shard, *self.shard.address(), UmmoError::Unauthorized);

        require_keys_eq!(
            self.market.matcher_authority,
            *self.matcher.address(),
            UmmoError::Unauthorized
        );

        let now_slot = self.clock.slot.get();
        let oracle = get_oracle_price_1e6(self.oracle_feed.to_account_view(), now_slot)?;

        let oracle_price = oracle.price;
        let diff = if exec_price > oracle_price {
            exec_price - oracle_price
        } else {
            oracle_price - exec_price
        };
        let max_diff = oracle_price.saturating_mul(MAX_EXEC_SLIPPAGE_BPS) / 10_000;
        require!(diff <= max_diff, UmmoError::ExecPriceTooFarFromOracle);

        let engine_idx = self.trader.engine_index.get();
        let house_idx = self.shard.house_engine_index.get();

        {
            let engine = borrow_engine_mut(self.engine);
            engine
                .require_fresh_crank(now_slot)
                .map_err(UmmoError::from)?;
            engine
                .execute_trade(
                    engine_idx,
                    house_idx,
                    oracle_price,
                    now_slot,
                    size_q as i128,
                    exec_price,
                )
                .map_err(UmmoError::from)?;
        }

        emit!(TradeExecuted {
            market: *self.market.address(),
            shard: *self.shard.address(),
            trader: *self.trader.address(),
            owner: *self.signer.address(),
            size_q,
            exec_price,
            oracle_price,
            now_slot,
            oracle_posted_slot: oracle.posted_slot,
        });

        Ok(())
    }
}


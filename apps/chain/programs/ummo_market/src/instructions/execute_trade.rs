use anchor_lang::prelude::*;

use crate::{
    constants::{ENGINE_SEED, MARKET_SEED, SHARD_SEED, TRADER_SEED},
    error::UmmoError,
    state::{MarketConfig, MarketShard, Trader},
};

#[derive(Accounts)]
pub struct ExecuteTrade<'info> {
    pub signer: Signer<'info>,

    pub matcher: Signer<'info>,

    /// CHECK: used only for market PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()], bump = shard.bump)]
    pub shard: Account<'info, MarketShard>,

    #[account(mut, seeds = [ENGINE_SEED, shard.key().as_ref()], bump)]
    pub engine: UncheckedAccount<'info>,

    #[account(seeds = [TRADER_SEED, shard.key().as_ref(), signer.key().as_ref()], bump = trader.bump)]
    pub trader: Account<'info, Trader>,
}

pub fn handler(_ctx: Context<ExecuteTrade>, _exec_price: u64, _size_q: i64) -> Result<()> {
    err!(UmmoError::NotImplemented)
}


use anchor_lang::prelude::*;

use crate::{
    constants::{ENGINE_SEED, MARKET_SEED, SHARD_SEED},
    error::UmmoError,
    state::{MarketConfig, MarketShard},
};

#[derive(Accounts)]
pub struct KeeperCrank<'info> {
    pub signer: Signer<'info>,

    /// CHECK: used only for market PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(mut, seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()], bump = shard.bump)]
    pub shard: Account<'info, MarketShard>,

    #[account(mut, seeds = [ENGINE_SEED, shard.key().as_ref()], bump)]
    pub engine: UncheckedAccount<'info>,
}

pub fn handler(
    _ctx: Context<KeeperCrank>,
    _now_slot: u64,
    _oracle_price: u64,
    _ordered_candidates: Vec<u16>,
    _max_revalidations: u16,
) -> Result<()> {
    err!(UmmoError::NotImplemented)
}


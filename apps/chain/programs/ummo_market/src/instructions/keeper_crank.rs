use anchor_lang::prelude::*;

use crate::{
    constants::{ENGINE_SEED, MARKET_SEED, SHARD_SEED},
    engine::with_engine_mut,
    error::UmmoError,
    oracle::get_oracle_price_1e6,
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

    /// CHECK: engine account is validated by PDA seeds for future crank logic.
    #[account(mut, seeds = [ENGINE_SEED, shard.key().as_ref()], bump)]
    pub engine: UncheckedAccount<'info>,
}

pub fn handler(
    ctx: Context<KeeperCrank>,
    _now_slot: u64,
    _oracle_price: u64,
    ordered_candidates: Vec<u16>,
    max_revalidations: u16,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.shard.market,
        ctx.accounts.market.key(),
        UmmoError::DebugKeeperCrankShardMarketMismatch
    );

    let now_slot = Clock::get()?.slot;
    let oracle = get_oracle_price_1e6(&ctx.accounts.oracle_feed, now_slot)?;
    msg!(
        "keeper_crank: shard_last_crank_slot={} now_slot={} oracle_posted_slot={} ordered_candidates={} max_revalidations={}",
        ctx.accounts.shard.last_crank_slot,
        now_slot,
        oracle.posted_slot,
        ordered_candidates.len(),
        max_revalidations,
    );
    with_engine_mut(&ctx.accounts.engine, |risk_engine| {
        risk_engine
            .keeper_crank(now_slot, oracle.price, &ordered_candidates, max_revalidations)
            .map_err(|err| match err {
                percolator::RiskError::Unauthorized => {
                    error!(UmmoError::DebugKeeperCrankEngineUnauthorized)
                }
                _ => error!(UmmoError::from(err)),
            })?;
        Ok(())
    })?;
    ctx.accounts.shard.last_crank_slot = now_slot;
    Ok(())
}


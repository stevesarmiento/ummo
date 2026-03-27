use anchor_lang::prelude::*;

use crate::{
    constants::{
        FUNDING_ACCUMULATOR_SEED,
        MARKET_SEED,
        SHARD_SEED,
        TRADER_FUNDING_STATE_SEED,
        TRADER_SEED,
    },
    error::UmmoError,
    state::{FundingAccumulator, MarketConfig, MarketShard, Trader, TraderFundingState},
};

#[derive(Accounts)]
pub struct SyncTraderFundingState<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    /// CHECK: used only for PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()], bump = shard.bump)]
    pub shard: Account<'info, MarketShard>,

    #[account(seeds = [TRADER_SEED, shard.key().as_ref(), signer.key().as_ref()], bump = trader.bump)]
    pub trader: Account<'info, Trader>,

    #[account(mut, seeds = [FUNDING_ACCUMULATOR_SEED, shard.key().as_ref()], bump = funding_accumulator.bump)]
    pub funding_accumulator: Account<'info, FundingAccumulator>,

    #[account(mut, seeds = [TRADER_FUNDING_STATE_SEED, trader.key().as_ref()], bump = trader_funding_state.bump)]
    pub trader_funding_state: Account<'info, TraderFundingState>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn handler(ctx: Context<SyncTraderFundingState>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.trader.owner,
        ctx.accounts.signer.key(),
        UmmoError::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.trader_funding_state.trader,
        ctx.accounts.trader.key(),
        UmmoError::InvalidPda
    );

    ctx.accounts.trader_funding_state.funding_k_long_snap = ctx.accounts.funding_accumulator.funding_k_long;
    ctx.accounts.trader_funding_state.funding_k_short_snap = ctx.accounts.funding_accumulator.funding_k_short;
    ctx.accounts.trader_funding_state.last_update_slot = ctx.accounts.clock.slot;

    Ok(())
}


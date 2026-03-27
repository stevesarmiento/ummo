use anchor_lang::prelude::*;

use crate::{
    constants::{MARKET_SEED, RAILS_SEED, SHARD_SEED},
    error::UmmoError,
    events::RailsUpdated,
    state::{MarketConfig, MarketRails, MarketShard, RailTier},
};

#[derive(Accounts)]
pub struct SetMarketRails<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: used only for PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()], bump = shard.bump)]
    pub shard: Account<'info, MarketShard>,

    #[account(mut, seeds = [RAILS_SEED, shard.key().as_ref()], bump = rails.bump)]
    pub rails: Account<'info, MarketRails>,

    pub clock: Sysvar<'info, Clock>,
}

fn validate_tiers(tiers: &[RailTier; 3]) -> Result<()> {
    let mut prev_max: u64 = 0;
    for tier in tiers.iter() {
        require!(tier.max_notional > 0, UmmoError::InvalidAmount);
        require!(tier.max_notional >= prev_max, UmmoError::InvalidAmount);
        require!(tier.max_oracle_deviation_bps > 0, UmmoError::InvalidAmount);
        prev_max = tier.max_notional;
    }
    Ok(())
}

pub fn handler(ctx: Context<SetMarketRails>, tiers: [RailTier; 3]) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.market.authority,
        ctx.accounts.authority.key(),
        UmmoError::Unauthorized
    );
    validate_tiers(&tiers)?;

    let now_slot = ctx.accounts.clock.slot;
    ctx.accounts.rails.tiers = tiers;
    ctx.accounts.rails.updated_at_slot = now_slot;

    emit!(RailsUpdated {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        now_slot,
        first_tier_max_notional: ctx.accounts.rails.tiers[0].max_notional,
        first_tier_max_oracle_deviation_bps: ctx.accounts.rails.tiers[0].max_oracle_deviation_bps,
        second_tier_max_notional: ctx.accounts.rails.tiers[1].max_notional,
        second_tier_max_oracle_deviation_bps: ctx.accounts.rails.tiers[1].max_oracle_deviation_bps,
        third_tier_max_notional: ctx.accounts.rails.tiers[2].max_notional,
        third_tier_max_oracle_deviation_bps: ctx.accounts.rails.tiers[2].max_oracle_deviation_bps,
    });

    Ok(())
}


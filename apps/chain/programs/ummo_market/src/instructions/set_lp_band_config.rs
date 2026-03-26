use anchor_lang::prelude::*;

use crate::{
    constants::{LP_BAND_SEED, LP_POOL_SEED, MARKET_SEED, SHARD_SEED},
    error::UmmoError,
    events::LpBandConfigured,
    state::{LpBandConfig, LpPool, MarketConfig, MarketShard, QuoteBand},
};

fn validate_band(band: &QuoteBand) -> Result<()> {
    require!(band.spread_bps > 0, UmmoError::InvalidAmount);
    require!(band.max_notional > 0, UmmoError::InvalidAmount);
    require!(band.max_oracle_deviation_bps > 0, UmmoError::InvalidAmount);
    Ok(())
}

#[derive(Accounts)]
pub struct SetLpBandConfig<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: used only for market PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(
        seeds = [MARKET_SEED, oracle_feed.key().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, MarketConfig>,

    #[account(
        seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()],
        bump = shard.bump
    )]
    pub shard: Account<'info, MarketShard>,

    #[account(
        seeds = [LP_POOL_SEED, shard.key().as_ref()],
        bump = lp_pool.bump
    )]
    pub lp_pool: Account<'info, LpPool>,

    #[account(
        init_if_needed,
        payer = owner,
        space = LpBandConfig::SPACE,
        seeds = [LP_BAND_SEED, lp_pool.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub lp_band_config: Account<'info, LpBandConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SetLpBandConfig>, bands: [QuoteBand; 3]) -> Result<()> {
    for band in &bands {
        validate_band(band)?;
    }
    require!(
        bands[0].max_oracle_deviation_bps <= bands[1].max_oracle_deviation_bps
            && bands[1].max_oracle_deviation_bps <= bands[2].max_oracle_deviation_bps,
        UmmoError::InvalidAmount
    );

    let now_slot = Clock::get()?.slot;
    let config = &mut ctx.accounts.lp_band_config;
    if config.updated_at_slot == 0 {
        config.lp_pool = ctx.accounts.lp_pool.key();
        config.owner = ctx.accounts.owner.key();
        config.bump = ctx.bumps.lp_band_config;
    } else {
        require_keys_eq!(config.lp_pool, ctx.accounts.lp_pool.key(), UmmoError::Unauthorized);
        require_keys_eq!(config.owner, ctx.accounts.owner.key(), UmmoError::Unauthorized);
        require_eq!(config.bump, ctx.bumps.lp_band_config, UmmoError::InvalidPda);
    }
    config.bands = bands;
    config.updated_at_slot = now_slot;

    emit!(LpBandConfigured {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        lp_pool: ctx.accounts.lp_pool.key(),
        owner: ctx.accounts.owner.key(),
        lp_band_config: config.key(),
        first_band_max_notional: bands[0].max_notional,
        first_band_max_oracle_deviation_bps: bands[0].max_oracle_deviation_bps,
        first_band_spread_bps: bands[0].spread_bps,
        first_band_max_inventory_bps: bands[0].max_inventory_bps,
        second_band_max_notional: bands[1].max_notional,
        second_band_max_oracle_deviation_bps: bands[1].max_oracle_deviation_bps,
        second_band_spread_bps: bands[1].spread_bps,
        second_band_max_inventory_bps: bands[1].max_inventory_bps,
        third_band_max_notional: bands[2].max_notional,
        third_band_max_oracle_deviation_bps: bands[2].max_oracle_deviation_bps,
        third_band_spread_bps: bands[2].spread_bps,
        third_band_max_inventory_bps: bands[2].max_inventory_bps,
        updated_at_slot: now_slot,
    });

    Ok(())
}

use anchor_lang::prelude::*;

use crate::{
    constants::{LIQUIDATION_CONFIG_SEED, MARKET_SEED, SHARD_SEED, USDC_ONE},
    error::UmmoError,
    events::LiquidationConfigUpdated,
    state::{LiquidationConfig, MarketConfig, MarketShard},
};

const MAX_BOUNTY_CAP_ABS: u64 = 10_000 * USDC_ONE; // 10k USDC hard cap

#[derive(Accounts)]
pub struct SetLiquidationConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: used only for PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()], bump = shard.bump)]
    pub shard: Account<'info, MarketShard>,

    #[account(
        init_if_needed,
        payer = authority,
        space = LiquidationConfig::SPACE,
        seeds = [LIQUIDATION_CONFIG_SEED, shard.key().as_ref()],
        bump
    )]
    pub liquidation_config: Account<'info, LiquidationConfig>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn handler(
    ctx: Context<SetLiquidationConfig>,
    is_enabled: bool,
    bounty_share_bps: u16,
    bounty_cap_abs: u64,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.market.authority,
        ctx.accounts.authority.key(),
        UmmoError::Unauthorized
    );
    require!(bounty_share_bps <= 10_000, UmmoError::InvalidAmount);
    require!(bounty_cap_abs <= MAX_BOUNTY_CAP_ABS, UmmoError::InvalidAmount);

    if ctx.accounts.liquidation_config.market == Pubkey::default() {
        ctx.accounts.liquidation_config.market = ctx.accounts.market.key();
        ctx.accounts.liquidation_config.shard = ctx.accounts.shard.key();
        ctx.accounts.liquidation_config.bump = ctx.bumps.liquidation_config;
    }

    require_keys_eq!(
        ctx.accounts.liquidation_config.market,
        ctx.accounts.market.key(),
        UmmoError::InvalidPda
    );
    require_keys_eq!(
        ctx.accounts.liquidation_config.shard,
        ctx.accounts.shard.key(),
        UmmoError::InvalidPda
    );

    ctx.accounts.liquidation_config.is_enabled = is_enabled;
    ctx.accounts.liquidation_config.bounty_share_bps = bounty_share_bps;
    ctx.accounts.liquidation_config.bounty_cap_abs = bounty_cap_abs;
    ctx.accounts.liquidation_config.updated_at_slot = ctx.accounts.clock.slot;

    emit!(LiquidationConfigUpdated {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        now_slot: ctx.accounts.clock.slot,
        is_enabled,
        bounty_share_bps,
        bounty_cap_abs,
    });

    Ok(())
}


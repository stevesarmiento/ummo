use anchor_lang::prelude::*;

use crate::{
    constants::{MARKET_SEED, RISK_STATE_SEED, SHARD_SEED},
    error::UmmoError,
    events::RiskConfigUpdated,
    state::{MarketConfig, MarketShard, RiskState},
};

const MIN_HALF_LIFE_SLOTS: u64 = 1;
const MAX_HALF_LIFE_SLOTS: u64 = 50_000; // ~5.5h @ 400ms/slot

#[derive(Accounts)]
pub struct SetRiskConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: used only for PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()], bump = shard.bump)]
    pub shard: Account<'info, MarketShard>,

    #[account(mut, seeds = [RISK_STATE_SEED, shard.key().as_ref()], bump = risk_state.bump)]
    pub risk_state: Account<'info, RiskState>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn handler(
    ctx: Context<SetRiskConfig>,
    sym_half_life_slots: u64,
    dir_half_life_slots: u64,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.market.authority,
        ctx.accounts.authority.key(),
        UmmoError::Unauthorized
    );
    require!(
        sym_half_life_slots >= MIN_HALF_LIFE_SLOTS && sym_half_life_slots <= MAX_HALF_LIFE_SLOTS,
        UmmoError::InvalidAmount
    );
    require!(
        dir_half_life_slots >= MIN_HALF_LIFE_SLOTS && dir_half_life_slots <= MAX_HALF_LIFE_SLOTS,
        UmmoError::InvalidAmount
    );

    ctx.accounts.risk_state.sym_half_life_slots = sym_half_life_slots;
    ctx.accounts.risk_state.dir_half_life_slots = dir_half_life_slots;

    let now_slot = ctx.accounts.clock.slot;
    emit!(RiskConfigUpdated {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        now_slot,
        sym_half_life_slots,
        dir_half_life_slots,
    });

    Ok(())
}


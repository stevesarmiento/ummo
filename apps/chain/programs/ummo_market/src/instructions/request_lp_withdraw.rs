use anchor_lang::prelude::*;

use crate::{
    constants::{
        LP_POOL_SEED, LP_POSITION_SEED, LP_WITHDRAW_COOLDOWN_SLOTS, MARKET_SEED, SHARD_SEED,
    },
    error::UmmoError,
    events::LpWithdrawalRequested,
    state::{LpPool, LpPosition, MarketConfig, MarketShard},
};

#[derive(Accounts)]
pub struct RequestLpWithdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: used only for market PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(
        seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()],
        bump = shard.bump
    )]
    pub shard: Account<'info, MarketShard>,

    #[account(
        mut,
        seeds = [LP_POOL_SEED, shard.key().as_ref()],
        bump = lp_pool.bump
    )]
    pub lp_pool: Account<'info, LpPool>,

    #[account(
        mut,
        seeds = [LP_POSITION_SEED, lp_pool.key().as_ref(), owner.key().as_ref()],
        bump = lp_position.bump
    )]
    pub lp_position: Account<'info, LpPosition>,
}

pub fn handler(ctx: Context<RequestLpWithdraw>, shares: u64) -> Result<()> {
    require!(shares > 0, UmmoError::InvalidAmount);
    require_keys_eq!(
        ctx.accounts.lp_pool.market,
        ctx.accounts.market.key(),
        UmmoError::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.lp_pool.shard,
        ctx.accounts.shard.key(),
        UmmoError::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.lp_position.lp_pool,
        ctx.accounts.lp_pool.key(),
        UmmoError::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.lp_position.owner,
        ctx.accounts.owner.key(),
        UmmoError::Unauthorized
    );
    require!(
        ctx.accounts.lp_position.pending_withdraw_shares == 0,
        UmmoError::PendingLpWithdrawalExists
    );

    let requested_shares = shares as u128;
    let active_shares = ctx
        .accounts
        .lp_position
        .shares
        .checked_sub(ctx.accounts.lp_position.locked_shares)
        .ok_or_else(|| error!(UmmoError::InvalidAmount))?;
    require!(requested_shares <= active_shares, UmmoError::InvalidAmount);
    require!(ctx.accounts.lp_pool.total_shares > 0, UmmoError::InvalidAmount);
    require!(ctx.accounts.lp_pool.estimated_nav > 0, UmmoError::InvalidAmount);

    let estimated_amount = requested_shares
        .checked_mul(ctx.accounts.lp_pool.estimated_nav)
        .and_then(|value| value.checked_div(ctx.accounts.lp_pool.total_shares))
        .filter(|value| *value > 0)
        .ok_or_else(|| error!(UmmoError::InvalidAmount))?;

    let now_slot = Clock::get()?.slot;
    let claimable_at_slot = now_slot
        .checked_add(LP_WITHDRAW_COOLDOWN_SLOTS)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;

    let lp_position = &mut ctx.accounts.lp_position;
    lp_position.locked_shares = lp_position
        .locked_shares
        .checked_add(requested_shares)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    lp_position.pending_withdraw_shares = requested_shares;
    lp_position.pending_withdraw_amount = estimated_amount;
    lp_position.pending_withdraw_claimable_at_slot = claimable_at_slot;

    let lp_pool = &mut ctx.accounts.lp_pool;
    lp_pool.pending_redemption_shares = lp_pool
        .pending_redemption_shares
        .checked_add(requested_shares)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    lp_pool.pending_redemption_value = lp_pool
        .pending_redemption_value
        .checked_add(estimated_amount)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;

    emit!(LpWithdrawalRequested {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        lp_pool: lp_pool.key(),
        owner: ctx.accounts.owner.key(),
        lp_position: lp_position.key(),
        requested_shares: u64::try_from(requested_shares)
            .map_err(|_| error!(UmmoError::RiskOverflow))?,
        estimated_amount: u64::try_from(estimated_amount)
            .map_err(|_| error!(UmmoError::RiskOverflow))?,
        claimable_at_slot,
    });

    Ok(())
}

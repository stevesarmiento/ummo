use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    constants::{ENGINE_SEED, LP_POOL_SEED, LP_POSITION_SEED, MARKET_SEED, SHARD_SEED},
    engine::with_engine_mut,
    error::UmmoError,
    events::LpWithdrawalClaimed,
    oracle::get_oracle_price_1e6,
    state::{LpPool, LpPosition, MarketConfig, MarketShard},
    token::{spl_token_transfer_signed, validate_token_program_for_mint},
};

#[derive(Accounts)]
pub struct ClaimLpWithdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: used only for market PDA derivation and oracle reads.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(
        seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()],
        bump = shard.bump
    )]
    pub shard: Account<'info, MarketShard>,

    /// CHECK: engine account is validated by PDA seeds and passed into risk engine loader.
    #[account(mut, seeds = [ENGINE_SEED, shard.key().as_ref()], bump)]
    pub engine: UncheckedAccount<'info>,

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

    #[account(address = market.collateral_mint)]
    pub collateral_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub user_collateral: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub vault_collateral: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn handler(ctx: Context<ClaimLpWithdraw>) -> Result<()> {
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
        ctx.accounts.lp_position.pending_withdraw_shares > 0
            && ctx.accounts.lp_position.pending_withdraw_amount > 0,
        UmmoError::NoPendingLpWithdrawal
    );
    require!(
        ctx.accounts.lp_position.pending_withdraw_claimable_at_slot <= ctx.accounts.clock.slot,
        UmmoError::ClaimNotReady
    );
    validate_token_program_for_mint(&ctx.accounts.token_program, &ctx.accounts.collateral_mint)?;
    require_keys_eq!(
        ctx.accounts.user_collateral.owner,
        ctx.accounts.owner.key(),
        UmmoError::InvalidTokenAccount
    );
    require_keys_eq!(
        ctx.accounts.user_collateral.mint,
        ctx.accounts.collateral_mint.key(),
        UmmoError::InvalidTokenAccount
    );
    require_keys_eq!(
        ctx.accounts.vault_collateral.owner,
        ctx.accounts.shard.key(),
        UmmoError::InvalidVaultAccount
    );
    require_keys_eq!(
        ctx.accounts.vault_collateral.mint,
        ctx.accounts.collateral_mint.key(),
        UmmoError::InvalidVaultAccount
    );

    let amount = ctx.accounts.lp_position.pending_withdraw_amount;
    let shares = ctx.accounts.lp_position.pending_withdraw_shares;
    require!(
        amount <= ctx.accounts.lp_pool.cash_nav && amount <= ctx.accounts.lp_pool.estimated_nav,
        UmmoError::RiskInsufficientBalance
    );

    let now_slot = ctx.accounts.clock.slot;
    let oracle = get_oracle_price_1e6(&ctx.accounts.oracle_feed, now_slot)?;
    with_engine_mut(&ctx.accounts.engine, |risk_engine| {
        risk_engine
            .withdraw(
                ctx.accounts.lp_pool.pooled_engine_index,
                amount,
                oracle.price,
                now_slot,
            )
            .map_err(|err| error!(UmmoError::from(err)))
    })?;

    let market_key = ctx.accounts.market.key();
    let shard_seed = ctx.accounts.shard.shard_seed;
    let shard_bump = [ctx.accounts.shard.bump];
    let signer_seeds: &[&[u8]] = &[
        SHARD_SEED,
        market_key.as_ref(),
        shard_seed.as_ref(),
        &shard_bump,
    ];
    let shard_info = ctx.accounts.shard.to_account_info();
    spl_token_transfer_signed(
        &ctx.accounts.token_program,
        &ctx.accounts.collateral_mint,
        &ctx.accounts.vault_collateral,
        &ctx.accounts.user_collateral,
        &shard_info,
        signer_seeds,
        u64::try_from(amount).map_err(|_| error!(UmmoError::RiskOverflow))?,
    )?;

    let lp_position = &mut ctx.accounts.lp_position;
    lp_position.shares = lp_position
        .shares
        .checked_sub(shares)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    lp_position.locked_shares = lp_position
        .locked_shares
        .checked_sub(shares)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    lp_position.pending_withdraw_shares = 0;
    lp_position.pending_withdraw_amount = 0;
    lp_position.pending_withdraw_claimable_at_slot = 0;

    let lp_pool = &mut ctx.accounts.lp_pool;
    lp_pool.total_shares = lp_pool
        .total_shares
        .checked_sub(shares)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    lp_pool.accounting_nav = lp_pool
        .accounting_nav
        .checked_sub(amount)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    lp_pool.cash_nav = lp_pool
        .cash_nav
        .checked_sub(amount)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    lp_pool.estimated_nav = lp_pool
        .estimated_nav
        .checked_sub(amount)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    lp_pool.pending_redemption_shares = lp_pool
        .pending_redemption_shares
        .checked_sub(shares)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    lp_pool.pending_redemption_value = lp_pool
        .pending_redemption_value
        .checked_sub(amount)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;

    emit!(LpWithdrawalClaimed {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        lp_pool: lp_pool.key(),
        owner: ctx.accounts.owner.key(),
        lp_position: lp_position.key(),
        burned_shares: u64::try_from(shares).map_err(|_| error!(UmmoError::RiskOverflow))?,
        claimed_amount: u64::try_from(amount).map_err(|_| error!(UmmoError::RiskOverflow))?,
        remaining_shares: u64::try_from(lp_position.shares)
            .map_err(|_| error!(UmmoError::RiskOverflow))?,
    });

    Ok(())
}

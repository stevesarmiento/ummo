use anchor_lang::prelude::*;

use crate::{
    constants::{ENGINE_SEED, MARKET_SEED, SHARD_SEED, USDC_ONE},
    engine::with_engine_mut,
    error::UmmoError,
    events::LpPositionOpened,
    state::{LpPool, LpPosition, MarketConfig, MarketShard},
    token::{read_token_account, spl_token_transfer},
};

fn minted_shares(amount: u64, total_shares: u128, nav: u128) -> Result<u128> {
    let amount = amount as u128;
    if total_shares == 0 || nav == 0 {
        return Ok(amount);
    }
    amount
        .checked_mul(total_shares)
        .and_then(|v| v.checked_div(nav))
        .filter(|shares| *shares > 0)
        .ok_or_else(|| error!(UmmoError::InvalidAmount))
}

#[derive(Accounts)]
pub struct DepositLp<'info> {
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
        mut,
        seeds = [b"lp_pool", shard.key().as_ref()],
        bump = lp_pool.bump
    )]
    pub lp_pool: Account<'info, LpPool>,

    #[account(
        mut,
        seeds = [ENGINE_SEED, shard.key().as_ref()],
        bump
    )]
    pub engine: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = owner,
        space = LpPosition::SPACE,
        seeds = [b"lp_position", lp_pool.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub lp_position: Account<'info, LpPosition>,

    #[account(mut)]
    pub user_collateral: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault_collateral: UncheckedAccount<'info>,

    pub token_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositLp>, amount: u64) -> Result<()> {
    require!(amount >= USDC_ONE, UmmoError::InvalidAmount);
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
        read_token_account(&ctx.accounts.user_collateral)?.owner,
        ctx.accounts.owner.key(),
        UmmoError::InvalidTokenAccount
    );
    require_keys_eq!(
        read_token_account(&ctx.accounts.user_collateral)?.mint,
        ctx.accounts.market.collateral_mint,
        UmmoError::InvalidTokenAccount
    );
    require_keys_eq!(
        read_token_account(&ctx.accounts.vault_collateral)?.owner,
        ctx.accounts.shard.key(),
        UmmoError::InvalidVaultAccount
    );
    require_keys_eq!(
        read_token_account(&ctx.accounts.vault_collateral)?.mint,
        ctx.accounts.market.collateral_mint,
        UmmoError::InvalidVaultAccount
    );

    let minted = minted_shares(
        amount,
        ctx.accounts.lp_pool.total_shares,
        ctx.accounts.lp_pool.accounting_nav,
    )?;

    spl_token_transfer(
        &ctx.accounts.token_program,
        &ctx.accounts.user_collateral,
        &ctx.accounts.vault_collateral,
        &ctx.accounts.owner,
        amount,
    )?;

    let pool_engine_index = ctx.accounts.lp_pool.pooled_engine_index;
    let now_slot = Clock::get()?.slot;
    with_engine_mut(&ctx.accounts.engine, |risk_engine| {
        risk_engine
            .deposit(pool_engine_index, amount as u128, 0, now_slot)
            .map_err(|err| error!(UmmoError::from(err)))
    })?;

    let lp_pool = &mut ctx.accounts.lp_pool;
    lp_pool.total_shares = lp_pool
        .total_shares
        .checked_add(minted)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    lp_pool.accounting_nav = lp_pool
        .accounting_nav
        .checked_add(amount as u128)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    lp_pool.total_deposited = lp_pool
        .total_deposited
        .checked_add(amount as u128)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;

    let lp_position = &mut ctx.accounts.lp_position;
    lp_position.lp_pool = lp_pool.key();
    lp_position.owner = ctx.accounts.owner.key();
    lp_position.bump = ctx.bumps.lp_position;
    lp_position.shares = lp_position
        .shares
        .checked_add(minted)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    lp_position.deposited_total = lp_position
        .deposited_total
        .checked_add(amount as u128)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    if lp_position.opened_at_slot == 0 {
        lp_position.opened_at_slot = now_slot;
    }

    emit!(LpPositionOpened {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        lp_pool: lp_pool.key(),
        owner: ctx.accounts.owner.key(),
        lp_position: lp_position.key(),
        shares: u64::try_from(minted).map_err(|_| error!(UmmoError::RiskOverflow))?,
        accounting_nav: u64::try_from(lp_pool.accounting_nav)
            .map_err(|_| error!(UmmoError::RiskOverflow))?,
    });

    Ok(())
}

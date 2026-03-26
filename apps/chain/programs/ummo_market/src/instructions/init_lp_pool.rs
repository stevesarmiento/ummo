use anchor_lang::prelude::*;

use crate::{
    constants::{MARKET_SEED, SHARD_SEED},
    error::UmmoError,
    events::LpPoolInitialized,
    state::{LpPool, MarketConfig, MarketShard},
};

pub const DEFAULT_LP_FEE_BPS: u16 = 7;
pub const DEFAULT_PROTOCOL_FEE_BPS: u16 = 3;

#[derive(Accounts)]
pub struct InitLpPool<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

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
        init,
        payer = payer,
        space = LpPool::SPACE,
        seeds = [b"lp_pool", shard.key().as_ref()],
        bump
    )]
    pub lp_pool: Account<'info, LpPool>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitLpPool>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.market.authority,
        ctx.accounts.payer.key(),
        UmmoError::Unauthorized
    );

    let created_at_slot = Clock::get()?.slot;
    let lp_pool = &mut ctx.accounts.lp_pool;
    lp_pool.market = ctx.accounts.market.key();
    lp_pool.shard = ctx.accounts.shard.key();
    lp_pool.collateral_mint = ctx.accounts.market.collateral_mint;
    lp_pool.bump = ctx.bumps.lp_pool;
    lp_pool.pooled_engine_index = ctx.accounts.shard.house_engine_index;
    lp_pool.lp_fee_bps = DEFAULT_LP_FEE_BPS;
    lp_pool.protocol_fee_bps = DEFAULT_PROTOCOL_FEE_BPS;
    lp_pool.total_shares = 0;
    lp_pool.accounting_nav = 0;
    lp_pool.cash_nav = 0;
    lp_pool.estimated_nav = 0;
    lp_pool.total_deposited = 0;
    lp_pool.protocol_fee_accrued = 0;
    lp_pool.pending_redemption_shares = 0;
    lp_pool.pending_redemption_value = 0;
    lp_pool.created_at_slot = created_at_slot;

    emit!(LpPoolInitialized {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        lp_pool: lp_pool.key(),
        collateral_mint: lp_pool.collateral_mint,
        pooled_engine_index: lp_pool.pooled_engine_index,
        lp_fee_bps: lp_pool.lp_fee_bps,
        protocol_fee_bps: lp_pool.protocol_fee_bps,
        created_at_slot,
    });

    Ok(())
}

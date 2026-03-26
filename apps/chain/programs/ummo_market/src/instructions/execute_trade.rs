use anchor_lang::prelude::*;

use crate::{
    constants::{ENGINE_SEED, MARKET_SEED, SHARD_SEED, TRADER_SEED},
    error::UmmoError,
    events::TradeExecuted,
    oracle::get_oracle_price_1e6,
    state::{LpPool, MarketConfig, MarketShard, Trader},
};

pub const MAX_EXEC_SLIPPAGE_BPS: u64 = 50;

#[derive(Accounts)]
pub struct ExecuteTrade<'info> {
    pub signer: Signer<'info>,

    pub matcher: Signer<'info>,

    /// CHECK: used only for market PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()], bump = shard.bump)]
    pub shard: Account<'info, MarketShard>,

    /// CHECK: engine account is validated by PDA seeds and passed into risk engine loader.
    #[account(mut, seeds = [ENGINE_SEED, shard.key().as_ref()], bump)]
    pub engine: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"lp_pool", shard.key().as_ref()],
        bump = lp_pool.bump
    )]
    pub lp_pool: Account<'info, LpPool>,

    #[account(seeds = [TRADER_SEED, shard.key().as_ref(), signer.key().as_ref()], bump = trader.bump)]
    pub trader: Account<'info, Trader>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn handler(ctx: Context<ExecuteTrade>, exec_price: u64, size_q: i64) -> Result<()> {
    require!(size_q != 0, UmmoError::InvalidAmount);
    require!(exec_price > 0, UmmoError::InvalidAmount);
    require_keys_eq!(
        ctx.accounts.market.matcher_authority,
        ctx.accounts.matcher.key(),
        UmmoError::DebugExecuteTradeMatcherMismatch
    );

    let now_slot = ctx.accounts.clock.slot;
    let oracle = get_oracle_price_1e6(&ctx.accounts.oracle_feed, now_slot)?;
    let oracle_price = oracle.price;
    let diff = exec_price.abs_diff(oracle_price);
    let max_diff = oracle_price.saturating_mul(MAX_EXEC_SLIPPAGE_BPS) / 10_000;
    require!(diff <= max_diff, UmmoError::ExecPriceTooFarFromOracle);

    let engine_idx = ctx.accounts.trader.engine_index;
    let house_idx = ctx.accounts.shard.house_engine_index;
    if ctx.accounts.lp_pool.pooled_engine_index != house_idx {
        // Legacy pools may have stale engine index metadata; align to shard house index.
        ctx.accounts.lp_pool.pooled_engine_index = house_idx;
    }
    msg!(
        "execute_trade: engine_idx={} house_idx={} now_slot={} oracle_posted_slot={} size_q={} exec_price={}",
        engine_idx,
        house_idx,
        now_slot,
        oracle.posted_slot,
        size_q,
        exec_price,
    );
    crate::engine::with_engine_mut(&ctx.accounts.engine, |risk_engine| {
        risk_engine
            .require_fresh_crank(now_slot)
            .map_err(|err| match err {
                percolator::RiskError::Unauthorized => {
                    error!(UmmoError::DebugExecuteTradeCrankUnauthorized)
                }
                _ => error!(UmmoError::from(err)),
            })?;
        risk_engine
            .execute_trade(
                engine_idx,
                house_idx,
                oracle_price,
                now_slot,
                size_q as i128,
                exec_price,
            )
            .map_err(|err| match err {
                percolator::RiskError::Unauthorized => {
                    error!(UmmoError::DebugExecuteTradeEngineUnauthorized)
                }
                _ => error!(UmmoError::from(err)),
            })
    })?;

    let trade_notional = ((size_q.unsigned_abs() as u128) * (exec_price as u128)) / 1_000_000u128;
    let lp_fee = (trade_notional * (ctx.accounts.lp_pool.lp_fee_bps as u128)) / 10_000u128;
    let protocol_fee = (trade_notional * (ctx.accounts.lp_pool.protocol_fee_bps as u128)) / 10_000u128;
    ctx.accounts.lp_pool.accounting_nav = ctx
        .accounts
        .lp_pool
        .accounting_nav
        .checked_add(lp_fee)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    ctx.accounts.lp_pool.cash_nav = ctx
        .accounts
        .lp_pool
        .cash_nav
        .checked_add(lp_fee)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    ctx.accounts.lp_pool.estimated_nav = ctx
        .accounts
        .lp_pool
        .estimated_nav
        .checked_add(lp_fee)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    ctx.accounts.lp_pool.protocol_fee_accrued = ctx
        .accounts
        .lp_pool
        .protocol_fee_accrued
        .checked_add(protocol_fee)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;

    emit!(TradeExecuted {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        trader: ctx.accounts.trader.key(),
        owner: ctx.accounts.signer.key(),
        size_q,
        exec_price,
        oracle_price,
        now_slot,
        oracle_posted_slot: oracle.posted_slot,
    });

    Ok(())
}


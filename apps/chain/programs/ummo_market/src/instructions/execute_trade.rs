use anchor_lang::prelude::*;

use crate::{
    constants::{
        ENGINE_SEED,
        MARKET_SEED,
        MATCHER_ALLOWLIST_SEED,
        RAILS_SEED,
        RISK_STATE_SEED,
        SHARD_SEED,
        TRADER_SEED,
    },
    error::UmmoError,
    events::TradeExecuted,
    oracle::get_oracle_price_1e6,
    risk::update_risk_state_and_get_price_1e6,
    state::{LpPool, MarketConfig, MarketShard, Trader},
    state::{MarketRails, MatcherAllowlist, RiskState},
};

pub const MAX_EXEC_DEVIATION_BPS_HARD_CAP: u16 = 200;

fn select_allowed_deviation_bps(trade_notional: u128, tiers: &[crate::state::RailTier; 3]) -> Option<u16> {
    for tier in tiers.iter() {
        if trade_notional <= tier.max_notional as u128 {
            return Some(tier.max_oracle_deviation_bps);
        }
    }
    None
}

fn max_oracle_diff_for_bps(oracle_price: u64, bps: u16) -> u64 {
    oracle_price.saturating_mul(bps as u64) / 10_000
}

fn is_matcher_authorized_for_market(
    market_key: &Pubkey,
    market_matcher_authority: &Pubkey,
    matcher_allowlist: Option<&MatcherAllowlist>,
    matcher: &Pubkey,
) -> bool {
    if market_matcher_authority == matcher {
        return true;
    }
    let Some(allowlist) = matcher_allowlist else {
        return false;
    };
    if allowlist.market != *market_key || !allowlist.is_enabled {
        return false;
    }
    let n = (allowlist.matcher_count as usize).min(allowlist.matchers.len());
    allowlist.matchers.iter().take(n).any(|k| k == matcher)
}

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

    #[account(mut, seeds = [RISK_STATE_SEED, shard.key().as_ref()], bump = risk_state.bump)]
    pub risk_state: Account<'info, RiskState>,

    #[account(seeds = [RAILS_SEED, shard.key().as_ref()], bump = rails.bump)]
    pub rails: Account<'info, MarketRails>,

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

    #[account(seeds = [MATCHER_ALLOWLIST_SEED, market.key().as_ref()], bump)]
    pub matcher_allowlist: Option<Account<'info, MatcherAllowlist>>,
}

pub fn handler(ctx: Context<ExecuteTrade>, exec_price: u64, size_q: i64) -> Result<()> {
    require!(size_q != 0, UmmoError::InvalidAmount);
    require!(exec_price > 0, UmmoError::InvalidAmount);
    let matcher_key = ctx.accounts.matcher.key();
    require!(
        is_matcher_authorized_for_market(
            &ctx.accounts.market.key(),
            &ctx.accounts.market.matcher_authority,
            ctx.accounts.matcher_allowlist.as_deref(),
            &matcher_key,
        ),
        UmmoError::MatcherNotAuthorized
    );

    let now_slot = ctx.accounts.clock.slot;
    let oracle = get_oracle_price_1e6(&ctx.accounts.oracle_feed, now_slot)?;
    let oracle_price = oracle.price;

    let trade_notional =
        ((size_q.unsigned_abs() as u128) * (oracle_price as u128)) / 1_000_000u128;
    let mut allowed_deviation_bps =
        select_allowed_deviation_bps(trade_notional, &ctx.accounts.rails.tiers)
            .ok_or_else(|| error!(UmmoError::TradeNotionalTooLarge))?;
    allowed_deviation_bps = core::cmp::min(allowed_deviation_bps, MAX_EXEC_DEVIATION_BPS_HARD_CAP);
    let diff = exec_price.abs_diff(oracle_price);
    let max_diff = max_oracle_diff_for_bps(oracle_price, allowed_deviation_bps);
    require!(diff <= max_diff, UmmoError::ExecPriceTooFarFromOracle);

    let risk_price = update_risk_state_and_get_price_1e6(
        &mut ctx.accounts.risk_state,
        oracle_price,
        now_slot,
    )?;

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
        risk_engine.execute_trade_with_risk_price(
            engine_idx,
            house_idx,
            oracle_price,
            risk_price,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::RailTier;

    #[test]
    fn rail_tier_selection_edges() {
        let tiers = [
            RailTier {
                max_notional: 250_000_000,
                max_oracle_deviation_bps: 40,
            },
            RailTier {
                max_notional: 500_000_000,
                max_oracle_deviation_bps: 75,
            },
            RailTier {
                max_notional: 1_000_000_000,
                max_oracle_deviation_bps: 120,
            },
        ];

        assert_eq!(select_allowed_deviation_bps(1, &tiers), Some(40));
        assert_eq!(select_allowed_deviation_bps(250_000_000, &tiers), Some(40));
        assert_eq!(select_allowed_deviation_bps(250_000_001, &tiers), Some(75));
        assert_eq!(select_allowed_deviation_bps(500_000_000, &tiers), Some(75));
        assert_eq!(select_allowed_deviation_bps(500_000_001, &tiers), Some(120));
        assert_eq!(select_allowed_deviation_bps(1_000_000_000, &tiers), Some(120));
        assert_eq!(select_allowed_deviation_bps(1_000_000_001, &tiers), None);
    }

    #[test]
    fn max_diff_works() {
        let oracle = 1_000_000u64;
        assert_eq!(max_oracle_diff_for_bps(oracle, 200), 20_000);
    }

    #[test]
    fn matcher_allowlist_auth_works() {
        let market = Pubkey::new_unique();
        let primary = Pubkey::new_unique();
        let secondary = Pubkey::new_unique();

        assert!(is_matcher_authorized_for_market(
            &market,
            &primary,
            None,
            &primary
        ));
        assert!(!is_matcher_authorized_for_market(
            &market,
            &primary,
            None,
            &secondary
        ));

        let mut allowlist = MatcherAllowlist {
            market,
            bump: 0,
            is_enabled: true,
            matcher_count: 1,
            matchers: [Pubkey::default(); 8],
        };
        allowlist.matchers[0] = secondary;

        assert!(is_matcher_authorized_for_market(
            &market,
            &primary,
            Some(&allowlist),
            &secondary
        ));
        assert!(!is_matcher_authorized_for_market(
            &market,
            &primary,
            Some(&allowlist),
            &Pubkey::new_unique()
        ));
    }
}


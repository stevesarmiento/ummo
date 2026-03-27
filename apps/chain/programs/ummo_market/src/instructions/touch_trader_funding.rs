use anchor_lang::prelude::*;

use crate::{
    constants::{
        ENGINE_SEED,
        FUNDING_ACCUMULATOR_SEED,
        MARKET_SEED,
        RISK_STATE_SEED,
        SHARD_SEED,
        TRADER_FUNDING_STATE_SEED,
        TRADER_SEED,
    },
    engine::with_engine_mut,
    error::UmmoError,
    events::FundingPaymentEvent,
    oracle::get_oracle_price_1e6,
    risk::update_risk_state_and_get_price_1e6,
    state::{FundingAccumulator, MarketConfig, MarketShard, RiskState, Trader, TraderFundingState},
};

struct EngineFundingPre {
    adl_coeff_long: i128,
    adl_coeff_short: i128,
    adl_mult_long: u128,
    adl_mult_short: u128,
    oi_long: u128,
    oi_short: u128,
    last_oracle_price: u64,
}

fn compute_funding_coeff_deltas(
    pre: &EngineFundingPre,
    post_coeff_long: i128,
    post_coeff_short: i128,
    oracle_price: u64,
) -> core::result::Result<(i128, i128), percolator::RiskError> {
    let delta_total_long = post_coeff_long
        .checked_sub(pre.adl_coeff_long)
        .ok_or(percolator::RiskError::Overflow)?;
    let delta_total_short = post_coeff_short
        .checked_sub(pre.adl_coeff_short)
        .ok_or(percolator::RiskError::Overflow)?;

    let current_price = if pre.last_oracle_price == 0 {
        oracle_price
    } else {
        pre.last_oracle_price
    };
    let delta_p = (oracle_price as i128)
        .checked_sub(current_price as i128)
        .ok_or(percolator::RiskError::Overflow)?;

    let delta_mark_long = if delta_p != 0 && pre.oi_long != 0 {
        percolator::checked_u128_mul_i128(pre.adl_mult_long, delta_p)?
    } else {
        0i128
    };
    let delta_mark_short = if delta_p != 0 && pre.oi_short != 0 {
        let v = percolator::checked_u128_mul_i128(pre.adl_mult_short, delta_p)?;
        v.checked_neg().ok_or(percolator::RiskError::Overflow)?
    } else {
        0i128
    };

    let delta_funding_long = delta_total_long
        .checked_sub(delta_mark_long)
        .ok_or(percolator::RiskError::Overflow)?;
    let delta_funding_short = delta_total_short
        .checked_sub(delta_mark_short)
        .ok_or(percolator::RiskError::Overflow)?;

    Ok((delta_funding_long, delta_funding_short))
}

fn funding_coeff_for_basis(acc: &FundingAccumulator, basis: i128) -> i128 {
    if basis >= 0 {
        acc.funding_k_long
    } else {
        acc.funding_k_short
    }
}

fn funding_snap_for_basis(state: &TraderFundingState, basis: i128) -> i128 {
    if basis >= 0 {
        state.funding_k_long_snap
    } else {
        state.funding_k_short_snap
    }
}

#[derive(Accounts)]
pub struct TouchTraderFunding<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    /// CHECK: used only for PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()], bump = shard.bump)]
    pub shard: Account<'info, MarketShard>,

    #[account(mut, seeds = [RISK_STATE_SEED, shard.key().as_ref()], bump = risk_state.bump)]
    pub risk_state: Account<'info, RiskState>,

    #[account(seeds = [TRADER_SEED, shard.key().as_ref(), signer.key().as_ref()], bump = trader.bump)]
    pub trader: Account<'info, Trader>,

    /// CHECK: engine account is validated by PDA seeds.
    #[account(mut, seeds = [ENGINE_SEED, shard.key().as_ref()], bump)]
    pub engine: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = signer,
        space = FundingAccumulator::SPACE,
        seeds = [FUNDING_ACCUMULATOR_SEED, shard.key().as_ref()],
        bump
    )]
    pub funding_accumulator: Account<'info, FundingAccumulator>,

    #[account(
        init_if_needed,
        payer = signer,
        space = TraderFundingState::SPACE,
        seeds = [TRADER_FUNDING_STATE_SEED, trader.key().as_ref()],
        bump
    )]
    pub trader_funding_state: Account<'info, TraderFundingState>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn handler(ctx: Context<TouchTraderFunding>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.trader.owner,
        ctx.accounts.signer.key(),
        UmmoError::Unauthorized
    );

    let now_slot = ctx.accounts.clock.slot;
    let oracle = get_oracle_price_1e6(&ctx.accounts.oracle_feed, now_slot)?;
    let oracle_price = oracle.price;

    let _risk_price = update_risk_state_and_get_price_1e6(
        &mut ctx.accounts.risk_state,
        oracle_price,
        now_slot,
    )?;

    let engine_idx = ctx.accounts.trader.engine_index;

    let (basis_after_touch, a_basis_after_touch, delta_funding_long, delta_funding_short) =
        with_engine_mut(&ctx.accounts.engine, |risk_engine| {
            let pre = EngineFundingPre {
                adl_coeff_long: risk_engine.adl_coeff_long,
                adl_coeff_short: risk_engine.adl_coeff_short,
                adl_mult_long: risk_engine.adl_mult_long,
                adl_mult_short: risk_engine.adl_mult_short,
                oi_long: risk_engine.oi_eff_long_q,
                oi_short: risk_engine.oi_eff_short_q,
                last_oracle_price: risk_engine.last_oracle_price,
            };

            risk_engine
                .touch_account_full(engine_idx as usize, oracle_price, now_slot)
                .map_err(|err| error!(UmmoError::from(err)))?;

            let (d_long, d_short) = compute_funding_coeff_deltas(
                &pre,
                risk_engine.adl_coeff_long,
                risk_engine.adl_coeff_short,
                oracle_price,
            )
            .map_err(|err| error!(UmmoError::from(err)))?;

            let acct = &risk_engine.accounts[engine_idx as usize];
            Ok((acct.position_basis_q, acct.adl_a_basis, d_long, d_short))
        })?;

    if ctx.accounts.funding_accumulator.market == Pubkey::default() {
        ctx.accounts.funding_accumulator.market = ctx.accounts.market.key();
        ctx.accounts.funding_accumulator.shard = ctx.accounts.shard.key();
        ctx.accounts.funding_accumulator.bump = ctx.bumps.funding_accumulator;
        ctx.accounts.funding_accumulator.funding_k_long = 0;
        ctx.accounts.funding_accumulator.funding_k_short = 0;
        ctx.accounts.funding_accumulator.last_update_slot = 0;
    }
    require_keys_eq!(
        ctx.accounts.funding_accumulator.market,
        ctx.accounts.market.key(),
        UmmoError::InvalidPda
    );
    require_keys_eq!(
        ctx.accounts.funding_accumulator.shard,
        ctx.accounts.shard.key(),
        UmmoError::InvalidPda
    );

    ctx.accounts.funding_accumulator.funding_k_long = ctx
        .accounts
        .funding_accumulator
        .funding_k_long
        .checked_add(delta_funding_long)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    ctx.accounts.funding_accumulator.funding_k_short = ctx
        .accounts
        .funding_accumulator
        .funding_k_short
        .checked_add(delta_funding_short)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
    ctx.accounts.funding_accumulator.last_update_slot = now_slot;

    if ctx.accounts.trader_funding_state.owner == Pubkey::default() {
        ctx.accounts.trader_funding_state.owner = ctx.accounts.signer.key();
        ctx.accounts.trader_funding_state.market = ctx.accounts.market.key();
        ctx.accounts.trader_funding_state.shard = ctx.accounts.shard.key();
        ctx.accounts.trader_funding_state.trader = ctx.accounts.trader.key();
        ctx.accounts.trader_funding_state.bump = ctx.bumps.trader_funding_state;
        ctx.accounts.trader_funding_state.funding_k_long_snap = 0;
        ctx.accounts.trader_funding_state.funding_k_short_snap = 0;
        ctx.accounts.trader_funding_state.cumulative_funding_pnl = 0;
        ctx.accounts.trader_funding_state.last_update_slot = 0;
    }
    require_keys_eq!(
        ctx.accounts.trader_funding_state.trader,
        ctx.accounts.trader.key(),
        UmmoError::InvalidPda
    );

    let current_funding_k_long = ctx.accounts.funding_accumulator.funding_k_long;
    let current_funding_k_short = ctx.accounts.funding_accumulator.funding_k_short;

    let current_funding_k = if basis_after_touch == 0 {
        0i128
    } else {
        funding_coeff_for_basis(&ctx.accounts.funding_accumulator, basis_after_touch)
    };

    // Initialize snapshots to "now" on first touch to avoid retroactive attribution.
    if ctx.accounts.trader_funding_state.last_update_slot == 0 {
        ctx.accounts.trader_funding_state.funding_k_long_snap = current_funding_k_long;
        ctx.accounts.trader_funding_state.funding_k_short_snap = current_funding_k_short;
        ctx.accounts.trader_funding_state.last_update_slot = now_slot;
        return Ok(());
    }

    if basis_after_touch == 0 {
        ctx.accounts.trader_funding_state.funding_k_long_snap = current_funding_k_long;
        ctx.accounts.trader_funding_state.funding_k_short_snap = current_funding_k_short;
        ctx.accounts.trader_funding_state.last_update_slot = now_slot;
        return Ok(());
    }

    let funding_k_snap = funding_snap_for_basis(&ctx.accounts.trader_funding_state, basis_after_touch);
    let delta_funding_pnl_i128 = if basis_after_touch == 0 || a_basis_after_touch == 0 {
        0i128
    } else {
        let abs_basis = basis_after_touch.unsigned_abs();
        let den = (a_basis_after_touch as u128)
            .checked_mul(percolator::POS_SCALE)
            .ok_or_else(|| error!(UmmoError::RiskOverflow))?;
        percolator::wide_signed_mul_div_floor_from_k_pair(
            abs_basis,
            current_funding_k,
            funding_k_snap,
            den,
        )
    };

    // Always sync BOTH sides to "now" to avoid retroactive attribution on side flips.
    ctx.accounts.trader_funding_state.funding_k_long_snap = current_funding_k_long;
    ctx.accounts.trader_funding_state.funding_k_short_snap = current_funding_k_short;
    ctx.accounts.trader_funding_state.last_update_slot = now_slot;
    ctx.accounts.trader_funding_state.cumulative_funding_pnl = ctx
        .accounts
        .trader_funding_state
        .cumulative_funding_pnl
        .checked_add(delta_funding_pnl_i128)
        .ok_or_else(|| error!(UmmoError::RiskOverflow))?;

    let delta_i64 = i64::try_from(delta_funding_pnl_i128)
        .map_err(|_| error!(UmmoError::RiskOverflow))?;
    let cum_i64 = i64::try_from(ctx.accounts.trader_funding_state.cumulative_funding_pnl)
        .map_err(|_| error!(UmmoError::RiskOverflow))?;

    if delta_i64 != 0 {
        emit!(FundingPaymentEvent {
            market: ctx.accounts.market.key(),
            shard: ctx.accounts.shard.key(),
            trader: ctx.accounts.trader.key(),
            owner: ctx.accounts.signer.key(),
            engine_index: engine_idx,
            now_slot: now_slot,
            delta_funding_pnl: delta_i64,
            cumulative_funding_pnl: cum_i64,
        });
    }

    Ok(())
}


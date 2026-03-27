use anchor_lang::prelude::*;

use crate::{
    constants::{
        ENGINE_SEED, FUNDING_INTERVAL_SLOTS, FUNDING_STATE_SEED, MARKET_SEED, SHARD_SEED,
    },
    engine::with_engine_mut,
    error::UmmoError,
    events::FundingRateUpdated,
    oracle::get_oracle_price_1e6,
    state::{FundingState, MarketConfig, MarketShard},
};

#[derive(Accounts)]
pub struct SetFundingRate<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    /// CHECK: used for market PDA derivation + oracle read.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()], bump = shard.bump)]
    pub shard: Account<'info, MarketShard>,

    #[account(
        init_if_needed,
        payer = signer,
        space = FundingState::SPACE,
        seeds = [FUNDING_STATE_SEED, shard.key().as_ref()],
        bump
    )]
    pub funding_state: Account<'info, FundingState>,

    /// CHECK: engine account is validated by PDA seeds and passed into risk engine loader.
    #[account(mut, seeds = [ENGINE_SEED, shard.key().as_ref()], bump)]
    pub engine: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn handler(ctx: Context<SetFundingRate>, new_rate_bps_per_slot: i64) -> Result<()> {
    // v1: allow either authority or matcher authority to submit funding updates.
    let signer = ctx.accounts.signer.key();
    require!(
        signer == ctx.accounts.market.authority || signer == ctx.accounts.market.matcher_authority,
        UmmoError::Unauthorized
    );

    let now_slot = ctx.accounts.clock.slot;

    // Init funding state if newly created.
    if ctx.accounts.funding_state.market == Pubkey::default() {
        ctx.accounts.funding_state.market = ctx.accounts.market.key();
        ctx.accounts.funding_state.shard = ctx.accounts.shard.key();
        ctx.accounts.funding_state.bump = ctx.bumps.funding_state;
        ctx.accounts.funding_state.interval_slots = FUNDING_INTERVAL_SLOTS;
        ctx.accounts.funding_state.last_update_slot = 0;
        ctx.accounts.funding_state.last_rate_bps_per_slot = 0;
    }

    require_keys_eq!(
        ctx.accounts.funding_state.market,
        ctx.accounts.market.key(),
        UmmoError::InvalidPda
    );
    require_keys_eq!(
        ctx.accounts.funding_state.shard,
        ctx.accounts.shard.key(),
        UmmoError::InvalidPda
    );

    let interval = ctx.accounts.funding_state.interval_slots;
    let last_update = ctx.accounts.funding_state.last_update_slot;
    if last_update != 0 && now_slot < last_update.saturating_add(interval) {
        return err!(UmmoError::FundingUpdateTooSoon);
    }

    // Anti-retroactivity: bring market accrual current under the existing rate before setting.
    let oracle = get_oracle_price_1e6(&ctx.accounts.oracle_feed, now_slot)?;
    let (old_rate, new_rate) = with_engine_mut(&ctx.accounts.engine, |risk_engine| {
        risk_engine
            .accrue_market_to(now_slot, oracle.price)
            .map_err(|err| error!(UmmoError::from(err)))?;
        let old = risk_engine.funding_rate_bps_per_slot_last;
        risk_engine.set_funding_rate_for_next_interval(new_rate_bps_per_slot);
        let new = risk_engine.funding_rate_bps_per_slot_last;
        Ok((old, new))
    })?;

    ctx.accounts.funding_state.last_update_slot = now_slot;
    ctx.accounts.funding_state.last_rate_bps_per_slot = new_rate;

    emit!(FundingRateUpdated {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        now_slot,
        old_rate_bps_per_slot: old_rate,
        new_rate_bps_per_slot: new_rate,
        interval_slots: interval,
    });

    Ok(())
}


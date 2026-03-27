use anchor_lang::prelude::*;

use crate::{
    constants::{ENGINE_SEED, MARKET_SEED, RISK_STATE_SEED, SHARD_SEED},
    engine::with_engine_mut,
    error::UmmoError,
    events::{CrankEvent, RiskStateUpdated},
    oracle::get_oracle_price_1e6,
    risk::update_risk_state_and_get_price_1e6,
    state::{MarketConfig, MarketShard},
    state::RiskState,
};

#[derive(Accounts)]
pub struct KeeperCrank<'info> {
    pub signer: Signer<'info>,

    /// CHECK: used only for market PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(mut, seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()], bump = shard.bump)]
    pub shard: Account<'info, MarketShard>,

    /// CHECK: engine account is validated by PDA seeds for future crank logic.
    #[account(mut, seeds = [ENGINE_SEED, shard.key().as_ref()], bump)]
    pub engine: UncheckedAccount<'info>,

    /// Optional: if provided, update risk EMA state during crank.
    /// This must be the correct `risk_state` PDA for the shard.
    #[account(mut)]
    pub risk_state: Option<Account<'info, RiskState>>,
}

pub fn handler(
    ctx: Context<KeeperCrank>,
    _now_slot: u64,
    _oracle_price: u64,
    ordered_candidates: Vec<u16>,
    max_revalidations: u16,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.shard.market,
        ctx.accounts.market.key(),
        UmmoError::DebugKeeperCrankShardMarketMismatch
    );

    let now_slot = Clock::get()?.slot;
    let prev_last_crank_slot = ctx.accounts.shard.last_crank_slot;
    let oracle = get_oracle_price_1e6(&ctx.accounts.oracle_feed, now_slot)?;

    let mut risk_price = oracle.price;
    let mut risk_event: Option<RiskStateUpdated> = None;
    if let Some(risk_state) = ctx.accounts.risk_state.as_mut() {
        let (expected, bump) = Pubkey::find_program_address(
            &[RISK_STATE_SEED, ctx.accounts.shard.key().as_ref()],
            &crate::ID,
        );
        require_keys_eq!(risk_state.key(), expected, UmmoError::InvalidPda);
        require!(risk_state.bump == bump, UmmoError::InvalidPda);

        risk_price = update_risk_state_and_get_price_1e6(risk_state, oracle.price, now_slot)?;
        risk_event = Some(RiskStateUpdated {
            market: ctx.accounts.market.key(),
            shard: ctx.accounts.shard.key(),
            now_slot,
            oracle_price: oracle.price,
            risk_price,
            ema_sym_price: risk_state.ema_sym_price,
            ema_dir_down_price: risk_state.ema_dir_down_price,
            ema_dir_up_price: risk_state.ema_dir_up_price,
        });
    }
    msg!(
        "keeper_crank: shard_last_crank_slot={} now_slot={} oracle_posted_slot={} ordered_candidates={} max_revalidations={}",
        ctx.accounts.shard.last_crank_slot,
        now_slot,
        oracle.posted_slot,
        ordered_candidates.len(),
        max_revalidations,
    );
    with_engine_mut(&ctx.accounts.engine, |risk_engine| {
        risk_engine
            .keeper_crank_with_risk_price(
                now_slot,
                oracle.price,
                risk_price,
                &ordered_candidates,
                max_revalidations,
            )
            .map_err(|err| match err {
                percolator::RiskError::Unauthorized => {
                    error!(UmmoError::DebugKeeperCrankEngineUnauthorized)
                }
                _ => error!(UmmoError::from(err)),
            })?;
        Ok(())
    })?;
    let advanced = now_slot > prev_last_crank_slot;
    ctx.accounts.shard.last_crank_slot = now_slot;

    emit!(CrankEvent {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        now_slot,
        last_crank_slot: now_slot,
        advanced,
    });

    if let Some(event) = risk_event {
        emit!(event);
    }
    Ok(())
}


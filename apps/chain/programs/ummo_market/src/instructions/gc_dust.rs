use anchor_lang::prelude::*;

use crate::{
    constants::{ENGINE_SEED, MARKET_SEED, SHARD_SEED},
    error::UmmoError,
    events::DustGarbageCollected,
    state::{MarketConfig, MarketShard},
};

#[derive(Accounts)]
pub struct GarbageCollectDust<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: used only for market PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()], bump = shard.bump)]
    pub shard: Account<'info, MarketShard>,

    /// CHECK: engine account is validated by PDA seeds.
    #[account(mut, seeds = [ENGINE_SEED, shard.key().as_ref()], bump)]
    pub engine: UncheckedAccount<'info>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn handler(ctx: Context<GarbageCollectDust>) -> Result<()> {
    require_keys_eq!(ctx.accounts.shard.market, ctx.accounts.market.key(), UmmoError::Unauthorized);
    let now_slot = ctx.accounts.clock.slot;

    let (num_closed, dust_swept_u128) = crate::engine::with_engine_mut(&ctx.accounts.engine, |risk_engine| {
        let old_ins = risk_engine.insurance_fund.balance.get();
        let closed = risk_engine.garbage_collect_dust();
        let new_ins = risk_engine.insurance_fund.balance.get();
        Ok((closed, new_ins.saturating_sub(old_ins)))
    })?;

    let dust_swept: u64 = dust_swept_u128
        .try_into()
        .map_err(|_| error!(UmmoError::RiskOverflow))?;

    emit!(DustGarbageCollected {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        num_closed,
        dust_swept,
        now_slot,
    });

    Ok(())
}


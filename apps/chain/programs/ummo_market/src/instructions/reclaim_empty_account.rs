use anchor_lang::prelude::*;

use crate::{
    constants::{ENGINE_SEED, MARKET_SEED, SHARD_SEED},
    error::UmmoError,
    events::AccountReclaimed,
    state::{MarketConfig, MarketShard},
};

#[derive(Accounts)]
pub struct ReclaimEmptyAccount<'info> {
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

pub fn handler(ctx: Context<ReclaimEmptyAccount>, engine_index: u16) -> Result<()> {
    require_keys_eq!(ctx.accounts.shard.market, ctx.accounts.market.key(), UmmoError::Unauthorized);
    require!(
        (engine_index as usize) < percolator::MAX_ACCOUNTS,
        UmmoError::InvalidAmount
    );

    let now_slot = ctx.accounts.clock.slot;
    let dust_swept_u128 = crate::engine::with_engine_mut(&ctx.accounts.engine, |risk_engine| {
        let old_ins = risk_engine.insurance_fund.balance.get();
        risk_engine
            .reclaim_empty_account(engine_index)
            .map_err(|err| error!(UmmoError::from(err)))?;
        let new_ins = risk_engine.insurance_fund.balance.get();
        Ok(new_ins.saturating_sub(old_ins))
    })?;

    let dust_swept: u64 = dust_swept_u128
        .try_into()
        .map_err(|_| error!(UmmoError::RiskOverflow))?;

    emit!(AccountReclaimed {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        engine_index,
        dust_swept,
        now_slot,
    });

    Ok(())
}


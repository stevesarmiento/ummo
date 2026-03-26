use anchor_lang::prelude::*;

use crate::{
    constants::{ENGINE_SEED, MARKET_SEED, SHARD_SEED, TRADER_SEED},
    error::UmmoError,
    events::TraderOpened,
    state::{MarketConfig, MarketShard, Trader},
};

#[derive(Accounts)]
pub struct OpenTrader<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

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

    /// CHECK: engine account is validated by PDA seeds and passed into risk engine loader.
    #[account(mut, seeds = [ENGINE_SEED, shard.key().as_ref()], bump)]
    pub engine: UncheckedAccount<'info>,

    #[account(
        init,
        payer = signer,
        space = Trader::SPACE,
        seeds = [TRADER_SEED, shard.key().as_ref(), signer.key().as_ref()],
        bump
    )]
    pub trader: Account<'info, Trader>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<OpenTrader>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.shard.market,
        ctx.accounts.market.key(),
        UmmoError::Unauthorized
    );

    let idx = crate::engine::with_engine_mut(&ctx.accounts.engine, |risk_engine| {
        risk_engine
            .add_user(0)
            .map_err(|err| error!(UmmoError::from(err)))
    })?;

    crate::engine::with_engine_mut(&ctx.accounts.engine, |risk_engine| {
        risk_engine
            .set_owner(idx, ctx.accounts.signer.key().to_bytes())
            .map_err(|err| error!(UmmoError::from(err)))
    })?;

    let trader = &mut ctx.accounts.trader;
    trader.owner = ctx.accounts.signer.key();
    trader.market = ctx.accounts.market.key();
    trader.shard = ctx.accounts.shard.key();
    trader.bump = ctx.bumps.trader;
    trader.engine_index = idx;
    trader.opened_at_slot = Clock::get()?.slot;

    emit!(TraderOpened {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        trader: trader.key(),
        owner: ctx.accounts.signer.key(),
        engine_index: idx,
    });

    Ok(())
}

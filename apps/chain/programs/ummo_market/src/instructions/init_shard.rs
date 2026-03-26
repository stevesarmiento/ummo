use anchor_lang::prelude::*;

use crate::{
    constants::{ENGINE_SEED, MARKET_SEED, SHARD_SEED},
    engine::{add_house_lp, create_engine_account, init_engine, with_engine_mut},
    error::UmmoError,
    events::ShardInitialized,
    state::{MarketConfig, MarketShard},
};

#[derive(Accounts)]
pub struct InitShard<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: used only for PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(
        seeds = [MARKET_SEED, oracle_feed.key().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, MarketConfig>,

    /// CHECK: arbitrary seed pubkey used for shard PDA derivation.
    pub shard_seed: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = MarketShard::SPACE,
        seeds = [SHARD_SEED, market.key().as_ref(), shard_seed.key().as_ref()],
        bump
    )]
    pub shard: Account<'info, MarketShard>,

    /// CHECK: engine account is validated by PDA seeds and initialized via system program.
    #[account(mut, seeds = [ENGINE_SEED, shard.key().as_ref()], bump)]
    pub engine: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitShard>, shard_id: u16) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.market.authority,
        ctx.accounts.payer.key(),
        UmmoError::Unauthorized
    );

    let created_at_slot = Clock::get()?.slot;
    let shard = &mut ctx.accounts.shard;
    shard.market = ctx.accounts.market.key();
    shard.bump = ctx.bumps.shard;
    shard.shard_id = shard_id;
    shard.shard_seed = ctx.accounts.shard_seed.key();
    shard.created_at_slot = created_at_slot;
    shard.last_crank_slot = created_at_slot;

    let shard_key = shard.key();
    let engine_bump_seed = [ctx.bumps.engine];
    let engine_seeds = [
        ENGINE_SEED,
        shard_key.as_ref(),
        engine_bump_seed.as_ref(),
    ];
    create_engine_account(
        &ctx.accounts.payer,
        &ctx.accounts.engine,
        &ctx.accounts.system_program,
        &engine_seeds,
    )?;
    init_engine(&ctx.accounts.engine)?;
    with_engine_mut(&ctx.accounts.engine, |risk_engine| {
        risk_engine.last_crank_slot = created_at_slot;
        risk_engine.last_full_sweep_start_slot = created_at_slot;
        risk_engine.last_full_sweep_completed_slot = created_at_slot;
        Ok(())
    })?;
    shard.house_engine_index = add_house_lp(&ctx.accounts.engine, &ctx.accounts.market.matcher_authority)?;

    emit!(ShardInitialized {
        market: ctx.accounts.market.key(),
        shard: shard.key(),
        authority: ctx.accounts.payer.key(),
        shard_seed: ctx.accounts.shard_seed.key(),
        shard_id,
        house_engine_index: shard.house_engine_index,
        created_at_slot,
        last_crank_slot: created_at_slot,
    });

    Ok(())
}

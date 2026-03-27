use anchor_lang::prelude::*;

use crate::{
    constants::{ENGINE_SEED, MARKET_SEED, RAILS_SEED, RISK_STATE_SEED, SHARD_SEED, USDC_ONE},
    engine::{add_house_lp, create_engine_account, init_engine, with_engine_mut},
    error::UmmoError,
    events::{RailsUpdated, RiskConfigUpdated, ShardInitialized},
    state::{MarketConfig, MarketRails, MarketShard, RailTier, RiskState},
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

    #[account(
        init,
        payer = payer,
        space = RiskState::SPACE,
        seeds = [RISK_STATE_SEED, shard.key().as_ref()],
        bump
    )]
    pub risk_state: Account<'info, RiskState>,

    #[account(
        init,
        payer = payer,
        space = MarketRails::SPACE,
        seeds = [RAILS_SEED, shard.key().as_ref()],
        bump
    )]
    pub rails: Account<'info, MarketRails>,

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

    // Initialize risk state and rails defaults.
    let now_slot = created_at_slot;

    let risk_state = &mut ctx.accounts.risk_state;
    risk_state.market = ctx.accounts.market.key();
    risk_state.shard = shard.key();
    risk_state.bump = ctx.bumps.risk_state;
    // Conservative-but-usable defaults; operator can tune later.
    risk_state.sym_half_life_slots = 900; // ~6 minutes @ 400ms/slot
    risk_state.dir_half_life_slots = 8; // ~3s @ 400ms/slot
    // Seed values will be initialized on the first oracle-read instruction (crank/trade/withdraw).
    risk_state.ema_sym_price = 0;
    risk_state.ema_dir_down_price = 0;
    risk_state.ema_dir_up_price = 0;
    risk_state.last_oracle_price = 0;
    risk_state.last_update_slot = now_slot;

    let rails = &mut ctx.accounts.rails;
    rails.market = ctx.accounts.market.key();
    rails.shard = shard.key();
    rails.bump = ctx.bumps.rails;
    rails.tiers = [
        RailTier {
            max_notional: 250 * USDC_ONE,
            max_oracle_deviation_bps: 40,
        },
        RailTier {
            max_notional: 500 * USDC_ONE,
            max_oracle_deviation_bps: 75,
        },
        RailTier {
            max_notional: 1_000 * USDC_ONE,
            max_oracle_deviation_bps: 120,
        },
    ];
    rails.updated_at_slot = now_slot;

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

    emit!(RiskConfigUpdated {
        market: ctx.accounts.market.key(),
        shard: shard.key(),
        now_slot,
        sym_half_life_slots: risk_state.sym_half_life_slots,
        dir_half_life_slots: risk_state.dir_half_life_slots,
    });

    emit!(RailsUpdated {
        market: ctx.accounts.market.key(),
        shard: shard.key(),
        now_slot,
        first_tier_max_notional: rails.tiers[0].max_notional,
        first_tier_max_oracle_deviation_bps: rails.tiers[0].max_oracle_deviation_bps,
        second_tier_max_notional: rails.tiers[1].max_notional,
        second_tier_max_oracle_deviation_bps: rails.tiers[1].max_oracle_deviation_bps,
        third_tier_max_notional: rails.tiers[2].max_notional,
        third_tier_max_oracle_deviation_bps: rails.tiers[2].max_oracle_deviation_bps,
    });

    Ok(())
}

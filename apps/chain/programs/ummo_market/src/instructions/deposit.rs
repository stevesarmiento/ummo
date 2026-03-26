use anchor_lang::prelude::*;

use crate::{
    constants::{ENGINE_SEED, MARKET_SEED, SHARD_SEED, TRADER_SEED},
    error::UmmoError,
    events::DepositEvent,
    token::{read_token_account, spl_token_transfer},
    state::{MarketConfig, MarketShard, Trader},
};

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub signer: Signer<'info>,

    /// CHECK: used only for market PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()], bump = shard.bump)]
    pub shard: Account<'info, MarketShard>,

    #[account(mut, seeds = [ENGINE_SEED, shard.key().as_ref()], bump)]
    pub engine: UncheckedAccount<'info>,

    #[account(seeds = [TRADER_SEED, shard.key().as_ref(), signer.key().as_ref()], bump = trader.bump)]
    pub trader: Account<'info, Trader>,

    #[account(mut)]
    pub user_collateral: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault_collateral: UncheckedAccount<'info>,

    pub token_program: UncheckedAccount<'info>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount >= crate::constants::USDC_ONE, UmmoError::InvalidAmount);
    require_keys_eq!(ctx.accounts.shard.market, ctx.accounts.market.key(), UmmoError::Unauthorized);
    require_keys_eq!(ctx.accounts.trader.owner, ctx.accounts.signer.key(), UmmoError::Unauthorized);
    require_keys_eq!(ctx.accounts.trader.market, ctx.accounts.market.key(), UmmoError::Unauthorized);
    require_keys_eq!(ctx.accounts.trader.shard, ctx.accounts.shard.key(), UmmoError::Unauthorized);

    let user_ta = read_token_account(&ctx.accounts.user_collateral)?;
    require_keys_eq!(user_ta.owner, ctx.accounts.signer.key(), UmmoError::InvalidTokenAccount);
    require_keys_eq!(user_ta.mint, ctx.accounts.market.collateral_mint, UmmoError::InvalidTokenAccount);
    let vault_ta = read_token_account(&ctx.accounts.vault_collateral)?;
    require_keys_eq!(vault_ta.owner, ctx.accounts.shard.key(), UmmoError::InvalidVaultAccount);
    require_keys_eq!(vault_ta.mint, ctx.accounts.market.collateral_mint, UmmoError::InvalidVaultAccount);

    spl_token_transfer(
        &ctx.accounts.token_program,
        &ctx.accounts.user_collateral,
        &ctx.accounts.vault_collateral,
        &ctx.accounts.signer,
        amount,
    )?;

    let engine_idx = ctx.accounts.trader.engine_index;
    crate::engine::with_engine_mut(&ctx.accounts.engine, |risk_engine| {
        risk_engine
            .deposit(engine_idx, amount as u128, 0, ctx.accounts.clock.slot)
            .map_err(|err| error!(UmmoError::from(err)))
    })?;

    emit!(DepositEvent {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        trader: ctx.accounts.trader.key(),
        owner: ctx.accounts.signer.key(),
        amount,
        engine_index: engine_idx,
        reserved0: 0,
        reserved1: 0,
    });

    Ok(())
}


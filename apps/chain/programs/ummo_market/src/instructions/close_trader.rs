use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    constants::{ENGINE_SEED, MARKET_SEED, RISK_STATE_SEED, SHARD_SEED, TRADER_SEED},
    error::UmmoError,
    events::TraderClosed,
    oracle::get_oracle_price_1e6,
    risk::update_risk_state_and_get_price_1e6,
    state::{MarketConfig, MarketShard, RiskState, Trader},
    token::{spl_token_transfer_signed, validate_token_program_for_mint},
};

#[derive(Accounts)]
pub struct CloseTrader<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    /// CHECK: used only for market PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()], bump = shard.bump)]
    pub shard: Account<'info, MarketShard>,

    #[account(mut, seeds = [RISK_STATE_SEED, shard.key().as_ref()], bump = risk_state.bump)]
    pub risk_state: Account<'info, RiskState>,

    /// CHECK: engine account is validated by PDA seeds.
    #[account(mut, seeds = [ENGINE_SEED, shard.key().as_ref()], bump)]
    pub engine: UncheckedAccount<'info>,

    #[account(
        mut,
        close = signer,
        seeds = [TRADER_SEED, shard.key().as_ref(), signer.key().as_ref()],
        bump = trader.bump
    )]
    pub trader: Account<'info, Trader>,

    #[account(address = market.collateral_mint)]
    pub collateral_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub user_collateral: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub vault_collateral: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn handler(ctx: Context<CloseTrader>) -> Result<()> {
    require_keys_eq!(ctx.accounts.shard.market, ctx.accounts.market.key(), UmmoError::Unauthorized);
    validate_token_program_for_mint(&ctx.accounts.token_program, &ctx.accounts.collateral_mint)?;
    require_keys_eq!(
        ctx.accounts.user_collateral.owner,
        ctx.accounts.signer.key(),
        UmmoError::InvalidTokenAccount
    );
    require_keys_eq!(
        ctx.accounts.user_collateral.mint,
        ctx.accounts.collateral_mint.key(),
        UmmoError::InvalidTokenAccount
    );
    require_keys_eq!(
        ctx.accounts.vault_collateral.owner,
        ctx.accounts.shard.key(),
        UmmoError::InvalidVaultAccount
    );
    require_keys_eq!(
        ctx.accounts.vault_collateral.mint,
        ctx.accounts.collateral_mint.key(),
        UmmoError::InvalidVaultAccount
    );

    let trader = &ctx.accounts.trader;
    require_keys_eq!(trader.owner, ctx.accounts.signer.key(), UmmoError::Unauthorized);
    require_keys_eq!(trader.market, ctx.accounts.market.key(), UmmoError::Unauthorized);
    require_keys_eq!(trader.shard, ctx.accounts.shard.key(), UmmoError::Unauthorized);

    let now_slot = ctx.accounts.clock.slot;
    let oracle = get_oracle_price_1e6(&ctx.accounts.oracle_feed, now_slot)?;
    let _risk_price = update_risk_state_and_get_price_1e6(
        &mut ctx.accounts.risk_state,
        oracle.price,
        now_slot,
    )?;

    let engine_index = trader.engine_index;
    let amount_u128 = crate::engine::with_engine_mut(&ctx.accounts.engine, |risk_engine| {
        require!(
            (engine_index as usize) < percolator::MAX_ACCOUNTS,
            UmmoError::InvalidAmount
        );

        let owner_bytes = risk_engine.accounts[engine_index as usize].owner;
        let owner = Pubkey::new_from_array(owner_bytes);
        require_keys_eq!(owner, ctx.accounts.signer.key(), UmmoError::Unauthorized);

        risk_engine
            .close_account(engine_index, now_slot, oracle.price)
            .map_err(|err| error!(UmmoError::from(err)))
    })?;

    let amount: u64 = amount_u128
        .try_into()
        .map_err(|_| error!(UmmoError::RiskOverflow))?;

    if amount > 0 {
        let market_key = ctx.accounts.market.key();
        let shard_seed = ctx.accounts.shard.shard_seed;
        let shard_bump = [ctx.accounts.shard.bump];
        let signer_seeds: &[&[u8]] = &[
            SHARD_SEED,
            market_key.as_ref(),
            shard_seed.as_ref(),
            &shard_bump,
        ];
        let shard_info = ctx.accounts.shard.to_account_info();
        spl_token_transfer_signed(
            &ctx.accounts.token_program,
            &ctx.accounts.collateral_mint,
            &ctx.accounts.vault_collateral,
            &ctx.accounts.user_collateral,
            &shard_info,
            signer_seeds,
            amount,
        )?;
    }

    emit!(TraderClosed {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        trader: trader.key(),
        owner: ctx.accounts.signer.key(),
        engine_index,
        amount_returned: amount,
        now_slot,
    });

    Ok(())
}


use quasar_lang::prelude::*;

use crate::{
    engine::{borrow_engine_mut, USDC_ONE},
    errors::UmmoError,
    events::DepositEvent,
    state::{MarketConfig, MarketShard, ShardEngine, Trader, ENGINE_SEED, MARKET_SEED, TRADER_SEED},
    token::{derive_associated_token_address, read_token_account, spl_token_transfer},
};

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub signer: &'info Signer,

    pub oracle_feed: &'info UncheckedAccount,

    #[account(seeds = [MARKET_SEED, oracle_feed], bump = market.bump)]
    pub market: &'info Account<MarketConfig>,

    pub shard: &'info Account<MarketShard>,

    #[account(mut, seeds = [ENGINE_SEED, shard], bump)]
    pub engine: &'info mut Account<ShardEngine>,

    #[account(seeds = [TRADER_SEED, shard, signer], bump = trader.bump)]
    pub trader: &'info Account<Trader>,

    #[account(mut)]
    pub user_collateral: &'info mut UncheckedAccount,

    #[account(mut)]
    pub vault_collateral: &'info mut UncheckedAccount,

    pub token_program: &'info UncheckedAccount,

    pub clock: &'info Sysvar<Clock>,
}

impl<'info> Deposit<'info> {
    #[inline(always)]
    pub fn deposit(&mut self, amount: u64) -> Result<(), ProgramError> {
        require!(amount >= USDC_ONE, UmmoError::InvalidAmount);

        require_keys_eq!(self.shard.market, *self.market.address(), UmmoError::Unauthorized);
        require_keys_eq!(self.trader.owner, *self.signer.address(), UmmoError::Unauthorized);
        require_keys_eq!(self.trader.market, *self.market.address(), UmmoError::Unauthorized);
        require_keys_eq!(self.trader.shard, *self.shard.address(), UmmoError::Unauthorized);

        let user_ta = read_token_account(self.user_collateral.to_account_view())?;
        require_keys_eq!(user_ta.owner, *self.signer.address(), UmmoError::InvalidTokenAccount);
        require_keys_eq!(user_ta.mint, self.market.collateral_mint, UmmoError::InvalidTokenAccount);

        let expected_vault = derive_associated_token_address(self.shard.address(), &self.market.collateral_mint)?;
        require_keys_eq!(*self.vault_collateral.address(), expected_vault, UmmoError::InvalidVaultAccount);

        let vault_ta = read_token_account(self.vault_collateral.to_account_view())?;
        require_keys_eq!(vault_ta.owner, *self.shard.address(), UmmoError::InvalidVaultAccount);
        require_keys_eq!(vault_ta.mint, self.market.collateral_mint, UmmoError::InvalidVaultAccount);

        spl_token_transfer(
            self.token_program,
            self.user_collateral,
            self.vault_collateral,
            self.signer,
            amount,
        )?;

        let engine_idx = self.trader.engine_index.get();
        borrow_engine_mut(self.engine)
            .deposit(engine_idx, amount as u128, 0, self.clock.slot.get())
            .map_err(UmmoError::from)?;

        emit!(DepositEvent {
            market: *self.market.address(),
            shard: *self.shard.address(),
            trader: *self.trader.address(),
            owner: *self.signer.address(),
            amount,
            engine_index: engine_idx,
            __reserved0: 0,
            __reserved1: 0,
        });

        Ok(())
    }
}


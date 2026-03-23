use quasar_lang::prelude::*;

use crate::{
    engine::borrow_engine_mut,
    errors::UmmoError,
    events::WithdrawalEvent,
    oracle::get_oracle_price_1e6,
    state::{MarketConfig, MarketShard, ShardEngine, Trader, ENGINE_SEED, MARKET_SEED, SHARD_SEED, TRADER_SEED},
    token::{derive_associated_token_address, read_token_account, spl_token_transfer_signed},
};

use quasar_lang::cpi::Seed;

#[derive(Accounts)]
pub struct Withdraw<'info> {
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

impl<'info> Withdraw<'info> {
    #[inline(always)]
    pub fn withdraw(&mut self, amount: u64) -> Result<(), ProgramError> {
        require!(amount > 0, UmmoError::InvalidAmount);

        require_keys_eq!(self.shard.market, *self.market.address(), UmmoError::Unauthorized);
        require_keys_eq!(self.trader.owner, *self.signer.address(), UmmoError::Unauthorized);
        require_keys_eq!(self.trader.market, *self.market.address(), UmmoError::Unauthorized);
        require_keys_eq!(self.trader.shard, *self.shard.address(), UmmoError::Unauthorized);

        let user_ta = read_token_account(self.user_collateral.to_account_view())?;
        require_keys_eq!(user_ta.owner, *self.signer.address(), UmmoError::InvalidTokenAccount);
        require_keys_eq!(user_ta.mint, self.market.collateral_mint, UmmoError::InvalidTokenAccount);

        let expected_vault =
            derive_associated_token_address(self.shard.address(), &self.market.collateral_mint)?;
        require_keys_eq!(*self.vault_collateral.address(), expected_vault, UmmoError::InvalidVaultAccount);

        let vault_ta = read_token_account(self.vault_collateral.to_account_view())?;
        require_keys_eq!(vault_ta.owner, *self.shard.address(), UmmoError::InvalidVaultAccount);
        require_keys_eq!(vault_ta.mint, self.market.collateral_mint, UmmoError::InvalidVaultAccount);

        let now_slot = self.clock.slot.get();
        let oracle = get_oracle_price_1e6(self.oracle_feed.to_account_view(), now_slot)?;

        let engine_idx = self.trader.engine_index.get();
        borrow_engine_mut(self.engine)
            .withdraw(engine_idx, amount as u128, oracle.price, now_slot)
            .map_err(UmmoError::from)?;

        let bump = [self.shard.bump];
        let seeds = [
            Seed::from(SHARD_SEED),
            Seed::from(self.market.address().as_ref()),
            Seed::from(self.shard.shard_seed.as_ref()),
            Seed::from(&bump),
        ];

        spl_token_transfer_signed(
            self.token_program,
            self.vault_collateral,
            self.user_collateral,
            self.shard,
            self.shard.address(),
            &seeds,
            amount,
        )?;

        emit!(WithdrawalEvent {
            market: *self.market.address(),
            shard: *self.shard.address(),
            trader: *self.trader.address(),
            owner: *self.signer.address(),
            amount,
            engine_index: engine_idx,
            __reserved0: 0,
            __reserved1: 0,
            now_slot,
            oracle_price: oracle.price,
            oracle_posted_slot: oracle.posted_slot,
        });

        Ok(())
    }
}


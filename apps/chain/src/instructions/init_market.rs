use quasar_lang::prelude::*;

use crate::{
    account_init::init_pda_account,
    events::MarketInitialized,
    state::{MarketConfig, MARKET_SEED, SHARD_SEED},
};

#[derive(Accounts)]
pub struct InitMarket<'info> {
    #[account(mut)]
    pub payer: &'info Signer,

    pub collateral_mint: &'info UncheckedAccount,
    pub oracle_feed: &'info UncheckedAccount,
    pub matcher_authority: &'info UncheckedAccount,

    #[account(mut, seeds = [MARKET_SEED, oracle_feed], bump)]
    pub market: &'info UncheckedAccount,

    pub system_program: &'info Program<System>,
    pub clock: &'info Sysvar<Clock>,
}

impl<'info> InitMarket<'info> {
    #[inline(always)]
    pub fn init_market(&mut self, market_id: u64, bumps: &InitMarketBumps) -> Result<(), ProgramError> {
        quasar_lang::__internal::log_str("init_market handler");
        let authority = *self.payer.address();
        let collateral_mint = *self.collateral_mint.address();
        let oracle_feed = *self.oracle_feed.address();
        let matcher_authority = *self.matcher_authority.address();
        let market = *self.market.address();
        let market_bump = [bumps.market];
        let market_seeds = [
            Seed::from(MARKET_SEED),
            Seed::from(oracle_feed.as_ref()),
            Seed::from(&market_bump),
        ];
        let market_account =
            init_pda_account::<MarketConfig>(self.system_program, self.payer, self.market, &market_seeds)?;

        market_account.authority = authority;
        market_account.bump = bumps.market;
        market_account.market_id = PodU64::from(market_id);
        market_account.collateral_mint = collateral_mint;
        market_account.oracle_feed = oracle_feed;
        market_account.matcher_authority = matcher_authority;
        market_account.created_at_slot = self.clock.slot;

        let shard = {
            let seeds: [&[u8]; 3] = [SHARD_SEED, market.as_ref(), oracle_feed.as_ref()];
            let (shard, _bump) =
                quasar_lang::pda::based_try_find_program_address(&seeds, &crate::ID)?;
            shard
        };

        emit!(MarketInitialized {
            market,
            shard,
            authority,
            collateral_mint,
            oracle_feed,
            matcher_authority,
            market_id,
        });

        Ok(())
    }
}


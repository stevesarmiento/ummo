use quasar_lang::prelude::*;

use crate::{
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

    #[account(mut, init, payer = payer, seeds = [MARKET_SEED, oracle_feed], bump)]
    pub market: &'info mut Account<MarketConfig>,

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

        self.market.authority = authority;
        self.market.bump = bumps.market;
        self.market.market_id = PodU64::from(market_id);
        self.market.collateral_mint = collateral_mint;
        self.market.oracle_feed = oracle_feed;
        self.market.matcher_authority = matcher_authority;
        self.market.created_at_slot = self.clock.slot;

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


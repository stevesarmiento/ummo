use quasar_lang::prelude::*;

use crate::{
    errors::UmmoError,
    events::MatcherAuthorityUpdated,
    state::{MarketConfig, MARKET_SEED},
};

#[derive(Accounts)]
pub struct SetMatcherAuthority<'info> {
    pub signer: &'info Signer,

    pub oracle_feed: &'info UncheckedAccount,

    #[account(mut, seeds = [MARKET_SEED, oracle_feed], bump = market.bump)]
    pub market: &'info mut Account<MarketConfig>,

    pub new_matcher_authority: &'info UncheckedAccount,

    pub clock: &'info Sysvar<Clock>,
}

impl<'info> SetMatcherAuthority<'info> {
    #[inline(always)]
    pub fn set_matcher_authority(&mut self) -> Result<(), ProgramError> {
        require_keys_eq!(self.market.authority, *self.signer.address(), UmmoError::Unauthorized);

        let old = self.market.matcher_authority;
        let next = *self.new_matcher_authority.address();

        self.market.matcher_authority = next;

        emit!(MatcherAuthorityUpdated {
            market: *self.market.address(),
            authority: *self.signer.address(),
            old_matcher_authority: old,
            new_matcher_authority: next,
            now_slot: self.clock.slot.get(),
        });

        Ok(())
    }
}


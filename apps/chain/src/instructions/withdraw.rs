use quasar_lang::prelude::*;

use crate::state::Market;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub signer: &'info Signer,

    #[account(mut, seeds = [b"market"], bump = market.bump)]
    pub market: &'info mut Account<Market>,
}

impl<'info> Withdraw<'info> {
    #[inline(always)]
    pub fn withdraw(&mut self, _amount: u64) -> Result<(), ProgramError> {
        Ok(())
    }
}


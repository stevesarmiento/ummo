use quasar_lang::prelude::*;

use crate::state::Market;

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub signer: &'info Signer,

    #[account(mut, seeds = [b"market"], bump = market.bump)]
    pub market: &'info mut Account<Market>,
}

impl<'info> Deposit<'info> {
    #[inline(always)]
    pub fn deposit(&mut self, _amount: u64) -> Result<(), ProgramError> {
        Ok(())
    }
}


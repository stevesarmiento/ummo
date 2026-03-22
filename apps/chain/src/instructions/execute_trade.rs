use quasar_lang::prelude::*;

use crate::state::Market;

#[derive(Accounts)]
pub struct ExecuteTrade<'info> {
    pub signer: &'info Signer,

    #[account(mut, seeds = [b"market"], bump = market.bump)]
    pub market: &'info mut Account<Market>,
}

impl<'info> ExecuteTrade<'info> {
    #[inline(always)]
    pub fn execute_trade(
        &mut self,
        _oracle_price: u64,
        _exec_price: u64,
        _size_q: i128,
    ) -> Result<(), ProgramError> {
        Ok(())
    }
}


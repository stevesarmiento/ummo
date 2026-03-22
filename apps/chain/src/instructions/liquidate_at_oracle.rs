use quasar_lang::prelude::*;

use crate::state::Market;

#[derive(Accounts)]
pub struct LiquidateAtOracle<'info> {
    pub signer: &'info Signer,

    #[account(mut, seeds = [b"market"], bump = market.bump)]
    pub market: &'info mut Account<Market>,
}

impl<'info> LiquidateAtOracle<'info> {
    #[inline(always)]
    pub fn liquidate_at_oracle(
        &mut self,
        _liquidatee_engine_idx: u16,
        _oracle_price: u64,
        _now_slot: u64,
    ) -> Result<(), ProgramError> {
        Ok(())
    }
}


use quasar_lang::prelude::*;

use crate::state::Market;

#[derive(Accounts)]
pub struct KeeperCrank<'info> {
    pub signer: &'info Signer,

    #[account(mut, seeds = [b"market"], bump = market.bump)]
    pub market: &'info mut Account<Market>,
}

impl<'info> KeeperCrank<'info> {
    #[inline(always)]
    pub fn keeper_crank(
        &mut self,
        _now_slot: u64,
        _oracle_price: u64,
        _ordered_candidates: &[[u8; 2]],
        _max_revalidations: u16,
    ) -> Result<(), ProgramError> {
        Ok(())
    }
}


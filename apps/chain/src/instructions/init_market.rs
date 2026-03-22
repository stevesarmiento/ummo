use quasar_lang::prelude::*;

use crate::state::Market;

#[derive(Accounts)]
pub struct InitMarket<'info> {
    #[account(mut)]
    pub payer: &'info mut Signer,

    #[account(init, payer = payer, seeds = [b"market"], bump)]
    pub market: &'info mut Account<Market>,

    pub system_program: &'info Program<System>,
    pub clock: &'info Sysvar<Clock>,
}

impl<'info> InitMarket<'info> {
    #[inline(always)]
    pub fn init_market(
        &mut self,
        initial_oracle_price: u64,
        bumps: &InitMarketBumps,
    ) -> Result<(), ProgramError> {
        self.market.authority = *self.payer.address();
        self.market.bump = bumps.market;
        self.market.created_at_slot = self.clock.slot;
        self.market.last_oracle_price = PodU64::from(initial_oracle_price);
        self.market.engine_len = PodU32::from(0u32);

        Ok(())
    }
}


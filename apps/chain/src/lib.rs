#![no_std]

use quasar_lang::prelude::*;

mod errors;
mod instructions;
mod state;

pub use errors::*;
pub use instructions::*;
pub use state::*;

declare_id!("4AboEjY4zXBF5QmDQCPT4XnaaU3pEGnCDuVy5HzR9T8e");

#[program]
mod ummo_market {
    use super::*;

    #[instruction(discriminator = 0)]
    pub fn init_market(ctx: Ctx<InitMarket>, initial_oracle_price: u64) -> Result<(), ProgramError> {
        ctx.accounts.init_market(initial_oracle_price, &ctx.bumps)
    }

    #[instruction(discriminator = 1)]
    pub fn deposit(ctx: Ctx<Deposit>, amount: u64) -> Result<(), ProgramError> {
        ctx.accounts.deposit(amount)
    }

    #[instruction(discriminator = 2)]
    pub fn withdraw(ctx: Ctx<Withdraw>, amount: u64) -> Result<(), ProgramError> {
        ctx.accounts.withdraw(amount)
    }

    #[instruction(discriminator = 3)]
    pub fn execute_trade(
        ctx: Ctx<ExecuteTrade>,
        oracle_price: u64,
        exec_price: u64,
        size_q: i128,
    ) -> Result<(), ProgramError> {
        ctx.accounts.execute_trade(oracle_price, exec_price, size_q)
    }

    #[instruction(discriminator = 4)]
    pub fn keeper_crank(
        ctx: Ctx<KeeperCrank>,
        now_slot: u64,
        oracle_price: u64,
        ordered_candidates: Vec<[u8; 2], u16, 512>,
        max_revalidations: u16,
    ) -> Result<(), ProgramError> {
        ctx.accounts
            .keeper_crank(now_slot, oracle_price, ordered_candidates, max_revalidations)
    }

    #[instruction(discriminator = 5)]
    pub fn liquidate_at_oracle(
        ctx: Ctx<LiquidateAtOracle>,
        liquidatee_engine_idx: u16,
        oracle_price: u64,
        now_slot: u64,
    ) -> Result<(), ProgramError> {
        ctx.accounts
            .liquidate_at_oracle(liquidatee_engine_idx, oracle_price, now_slot)
    }
}


pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("4AboEjY4zXBF5QmDQCPT4XnaaU3pEGnCDuVy5HzR9T8e");

#[program]
pub mod ummo_market {
    use super::*;

    pub fn init_market(ctx: Context<InitMarket>, initial_oracle_price: u64) -> Result<()> {
        crate::instructions::init_market::handler(ctx, initial_oracle_price)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        crate::instructions::deposit::handler(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        crate::instructions::withdraw::handler(ctx, amount)
    }

    pub fn execute_trade(ctx: Context<ExecuteTrade>, oracle_price: u64, exec_price: u64, size_q: i128) -> Result<()> {
        crate::instructions::execute_trade::handler(ctx, oracle_price, exec_price, size_q)
    }

    pub fn keeper_crank(
        ctx: Context<KeeperCrank>,
        now_slot: u64,
        oracle_price: u64,
        ordered_candidates: Vec<u16>,
        max_revalidations: u16,
    ) -> Result<()> {
        crate::instructions::keeper_crank::handler(
            ctx,
            now_slot,
            oracle_price,
            ordered_candidates,
            max_revalidations,
        )
    }

    pub fn liquidate_at_oracle(
        ctx: Context<LiquidateAtOracle>,
        liquidatee_engine_idx: u16,
        oracle_price: u64,
        now_slot: u64,
    ) -> Result<()> {
        crate::instructions::liquidate_at_oracle::handler(ctx, liquidatee_engine_idx, oracle_price, now_slot)
    }
}

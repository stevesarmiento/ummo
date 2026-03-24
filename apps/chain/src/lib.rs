#![no_std]

use quasar_lang::prelude::*;

mod errors;
mod engine;
mod events;
mod instructions;
mod oracle;
mod state;
mod token;

pub use errors::*;
pub use engine::*;
pub use events::*;
pub use instructions::*;
pub use oracle::*;
pub use state::*;
pub use token::*;

declare_id!("EMN8q6Lz1uhBqJusVygXxQvcFt3tmFCB4hnpk2Bbhymu");

#[no_mangle]
pub static UMMO_BUILD_MARKER: [u8; 17] = *b"UMMO_BUILD_MARKER";

#[cfg(feature = "debug")]
#[used]
static UMMO_DEBUG_FEATURE_MARKER: [u8; 26] = *b"UMMO_DEBUG_FEATURE_ENABLED";

#[program]
mod ummo_market {
    use super::*;

    #[instruction(discriminator = 0)]
    pub fn init_market(
        ctx: Ctx<InitMarket>,
        market_id: u64,
    ) -> Result<(), ProgramError> {
        ctx.accounts.init_market(market_id, &ctx.bumps)
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
        exec_price: u64,
        size_q: i64,
    ) -> Result<(), ProgramError> {
        ctx.accounts.execute_trade(exec_price, size_q)
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
    ) -> Result<(), ProgramError> {
        ctx.accounts.liquidate_at_oracle(liquidatee_engine_idx)
    }

    #[instruction(discriminator = 6)]
    pub fn open_trader(ctx: Ctx<OpenTrader>) -> Result<(), ProgramError> {
        ctx.accounts.open_trader(&ctx.bumps)
    }

    #[instruction(discriminator = 7)]
    pub fn init_shard(ctx: Ctx<InitShard>, shard_id: u16) -> Result<(), ProgramError> {
        ctx.accounts.init_shard(shard_id, &ctx.bumps)
    }

    #[instruction(discriminator = 8)]
    pub fn set_matcher_authority(ctx: Ctx<SetMatcherAuthority>) -> Result<(), ProgramError> {
        ctx.accounts.set_matcher_authority()
    }

    #[instruction(discriminator = 9)]
    pub fn test_writable(ctx: Ctx<TestWritable>) -> Result<(), ProgramError> {
        ctx.accounts.test_writable()
    }
}


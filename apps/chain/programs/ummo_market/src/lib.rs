pub mod constants;
pub mod error;
pub mod events;
pub mod engine;
pub mod instructions;
pub mod oracle;
pub mod state;
pub mod token;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use events::*;
pub use engine::*;
pub use instructions::*;
pub use oracle::*;
pub use state::*;
pub use token::*;

declare_id!("DiJFu657Rn1cncewnpsoWsqSxWKaQYpivVxGXSsC9vwB");

#[program]
pub mod ummo_market {
    use super::*;

    pub fn init_market(ctx: Context<InitMarket>, market_id: u64) -> Result<()> {
        crate::instructions::init_market::handler(ctx, market_id)
    }

    pub fn init_lp_pool(ctx: Context<InitLpPool>) -> Result<()> {
        crate::instructions::init_lp_pool::handler(ctx)
    }

    pub fn deposit_lp(ctx: Context<DepositLp>, amount: u64) -> Result<()> {
        crate::instructions::deposit_lp::handler(ctx, amount)
    }

    pub fn set_lp_band_config(
        ctx: Context<SetLpBandConfig>,
        bands: [QuoteBand; 3],
    ) -> Result<()> {
        crate::instructions::set_lp_band_config::handler(ctx, bands)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        crate::instructions::deposit::handler(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        crate::instructions::withdraw::handler(ctx, amount)
    }

    pub fn execute_trade(ctx: Context<ExecuteTrade>, exec_price: u64, size_q: i64) -> Result<()> {
        crate::instructions::execute_trade::handler(ctx, exec_price, size_q)
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
    ) -> Result<()> {
        crate::instructions::liquidate_at_oracle::handler(ctx, liquidatee_engine_idx)
    }

    pub fn open_trader(ctx: Context<OpenTrader>) -> Result<()> {
        crate::instructions::open_trader::handler(ctx)
    }

    pub fn init_shard(ctx: Context<InitShard>, shard_id: u16) -> Result<()> {
        crate::instructions::init_shard::handler(ctx, shard_id)
    }

    pub fn set_matcher_authority(ctx: Context<SetMatcherAuthority>) -> Result<()> {
        crate::instructions::set_matcher_authority::handler(ctx)
    }
}

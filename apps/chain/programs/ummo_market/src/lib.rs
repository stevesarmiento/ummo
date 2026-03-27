pub mod constants;
pub mod error;
pub mod events;
pub mod engine;
pub mod instructions;
pub mod oracle;
pub mod risk;
pub mod state;
pub mod token;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use events::*;
pub use engine::*;
pub use instructions::*;
pub use oracle::*;
pub use risk::*;
pub use state::*;
pub use token::*;

declare_id!("GB2SgmYPnk7d2SPJbA7EaGXwWA6uSkJZH2WxUJjBc8A5");

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

    pub fn request_lp_withdraw(ctx: Context<RequestLpWithdraw>, shares: u64) -> Result<()> {
        crate::instructions::request_lp_withdraw::handler(ctx, shares)
    }

    pub fn claim_lp_withdraw(ctx: Context<ClaimLpWithdraw>) -> Result<()> {
        crate::instructions::claim_lp_withdraw::handler(ctx)
    }

    pub fn set_lp_band_config(
        ctx: Context<SetLpBandConfig>,
        bands: [QuoteBand; 3],
    ) -> Result<()> {
        crate::instructions::set_lp_band_config::handler(ctx, bands)
    }

    pub fn set_funding_rate(ctx: Context<SetFundingRate>, new_rate_bps_per_slot: i64) -> Result<()> {
        crate::instructions::set_funding_rate::handler(ctx, new_rate_bps_per_slot)
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

    pub fn set_matcher_allowlist(
        ctx: Context<SetMatcherAllowlist>,
        is_enabled: bool,
        matchers: Vec<Pubkey>,
    ) -> Result<()> {
        crate::instructions::set_matcher_allowlist::handler(ctx, is_enabled, matchers)
    }

    pub fn set_risk_config(
        ctx: Context<SetRiskConfig>,
        sym_half_life_slots: u64,
        dir_half_life_slots: u64,
    ) -> Result<()> {
        crate::instructions::set_risk_config::handler(ctx, sym_half_life_slots, dir_half_life_slots)
    }

    pub fn set_market_rails(ctx: Context<SetMarketRails>, tiers: [RailTier; 3]) -> Result<()> {
        crate::instructions::set_market_rails::handler(ctx, tiers)
    }

    pub fn set_liquidation_config(
        ctx: Context<SetLiquidationConfig>,
        is_enabled: bool,
        bounty_share_bps: u16,
        bounty_cap_abs: u64,
    ) -> Result<()> {
        crate::instructions::set_liquidation_config::handler(
            ctx,
            is_enabled,
            bounty_share_bps,
            bounty_cap_abs,
        )
    }

    pub fn touch_trader_funding(ctx: Context<TouchTraderFunding>) -> Result<()> {
        crate::instructions::touch_trader_funding::handler(ctx)
    }

    pub fn sync_trader_funding_state(ctx: Context<SyncTraderFundingState>) -> Result<()> {
        crate::instructions::sync_trader_funding_state::handler(ctx)
    }

    pub fn close_account(ctx: Context<CloseAccount>, engine_index: u16) -> Result<()> {
        crate::instructions::close_account::handler(ctx, engine_index)
    }

    pub fn close_trader(ctx: Context<CloseTrader>) -> Result<()> {
        crate::instructions::close_trader::handler(ctx)
    }

    pub fn reclaim_empty_account(
        ctx: Context<ReclaimEmptyAccount>,
        engine_index: u16,
    ) -> Result<()> {
        crate::instructions::reclaim_empty_account::handler(ctx, engine_index)
    }

    pub fn garbage_collect_dust(ctx: Context<GarbageCollectDust>) -> Result<()> {
        crate::instructions::gc_dust::handler(ctx)
    }
}

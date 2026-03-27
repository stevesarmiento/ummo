use anchor_lang::prelude::*;

#[event]
pub struct MarketInitialized {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub authority: Pubkey,
    pub collateral_mint: Pubkey,
    pub oracle_feed: Pubkey,
    pub matcher_authority: Pubkey,
    pub market_id: u64,
}

#[event]
pub struct ShardInitialized {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub authority: Pubkey,
    pub shard_seed: Pubkey,
    pub shard_id: u16,
    pub house_engine_index: u16,
    pub created_at_slot: u64,
    pub last_crank_slot: u64,
}

#[event]
pub struct MatcherAuthorityUpdated {
    pub market: Pubkey,
    pub authority: Pubkey,
    pub old_matcher_authority: Pubkey,
    pub new_matcher_authority: Pubkey,
    pub now_slot: u64,
}

#[event]
pub struct TraderOpened {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub trader: Pubkey,
    pub owner: Pubkey,
    pub engine_index: u16,
}

#[event]
pub struct DepositEvent {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub trader: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub engine_index: u16,
    pub reserved0: u16,
    pub reserved1: u32,
}

#[event]
pub struct WithdrawalEvent {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub trader: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub engine_index: u16,
    pub reserved0: u16,
    pub reserved1: u32,
    pub now_slot: u64,
    pub oracle_price: u64,
    pub oracle_posted_slot: u64,
}

#[event]
pub struct TradeExecuted {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub trader: Pubkey,
    pub owner: Pubkey,
    pub size_q: i64,
    pub exec_price: u64,
    pub oracle_price: u64,
    pub now_slot: u64,
    pub oracle_posted_slot: u64,
}

#[event]
pub struct LpPoolInitialized {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub lp_pool: Pubkey,
    pub collateral_mint: Pubkey,
    pub pooled_engine_index: u16,
    pub lp_fee_bps: u16,
    pub protocol_fee_bps: u16,
    pub created_at_slot: u64,
}

#[event]
pub struct LpPositionOpened {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub lp_pool: Pubkey,
    pub owner: Pubkey,
    pub lp_position: Pubkey,
    pub shares: u64,
    pub accounting_nav: u64,
}

#[event]
pub struct LpBandConfigured {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub lp_pool: Pubkey,
    pub owner: Pubkey,
    pub lp_band_config: Pubkey,
    pub first_band_max_notional: u64,
    pub first_band_max_oracle_deviation_bps: u16,
    pub first_band_spread_bps: u16,
    pub first_band_max_inventory_bps: u16,
    pub second_band_max_notional: u64,
    pub second_band_max_oracle_deviation_bps: u16,
    pub second_band_spread_bps: u16,
    pub second_band_max_inventory_bps: u16,
    pub third_band_max_notional: u64,
    pub third_band_max_oracle_deviation_bps: u16,
    pub third_band_spread_bps: u16,
    pub third_band_max_inventory_bps: u16,
    pub updated_at_slot: u64,
}

#[event]
pub struct LpWithdrawalRequested {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub lp_pool: Pubkey,
    pub owner: Pubkey,
    pub lp_position: Pubkey,
    pub requested_shares: u64,
    pub estimated_amount: u64,
    pub claimable_at_slot: u64,
}

#[event]
pub struct LpWithdrawalClaimed {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub lp_pool: Pubkey,
    pub owner: Pubkey,
    pub lp_position: Pubkey,
    pub burned_shares: u64,
    pub claimed_amount: u64,
    pub remaining_shares: u64,
}

#[event]
pub struct CrankEvent {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub now_slot: u64,
    pub last_crank_slot: u64,
    pub advanced: bool,
}

#[event]
pub struct RiskStateUpdated {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub now_slot: u64,
    pub oracle_price: u64,
    pub risk_price: u64,
    pub ema_sym_price: u64,
    pub ema_dir_down_price: u64,
    pub ema_dir_up_price: u64,
}

#[event]
pub struct FundingRateUpdated {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub now_slot: u64,
    pub old_rate_bps_per_slot: i64,
    pub new_rate_bps_per_slot: i64,
    pub interval_slots: u64,
}

#[event]
pub struct LiquidationEvent {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub keeper: Pubkey,
    pub liquidatee_owner: Pubkey,
    pub liquidatee_engine_index: u16,
    pub liquidated: bool,
    pub old_effective_pos_q: i64,
    pub now_slot: u64,
    pub oracle_price: u64,
    pub oracle_posted_slot: u64,
}

#[event]
pub struct LiquidationBountyPaid {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub keeper: Pubkey,
    pub liquidatee_engine_index: u16,
    pub bounty_paid: u64,
    pub now_slot: u64,
}

#[event]
pub struct RiskConfigUpdated {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub now_slot: u64,
    pub sym_half_life_slots: u64,
    pub dir_half_life_slots: u64,
}

#[event]
pub struct RailsUpdated {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub now_slot: u64,
    pub first_tier_max_notional: u64,
    pub first_tier_max_oracle_deviation_bps: u16,
    pub second_tier_max_notional: u64,
    pub second_tier_max_oracle_deviation_bps: u16,
    pub third_tier_max_notional: u64,
    pub third_tier_max_oracle_deviation_bps: u16,
}

#[event]
pub struct LiquidationConfigUpdated {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub now_slot: u64,
    pub is_enabled: bool,
    pub bounty_share_bps: u16,
    pub bounty_cap_abs: u64,
}

#[event]
pub struct FundingPaymentEvent {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub trader: Pubkey,
    pub owner: Pubkey,
    pub engine_index: u16,
    pub now_slot: u64,
    pub delta_funding_pnl: i64,
    pub cumulative_funding_pnl: i64,
}

#[event]
pub struct AccountClosed {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub owner: Pubkey,
    pub engine_index: u16,
    pub amount_returned: u64,
    pub now_slot: u64,
}

#[event]
pub struct TraderClosed {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub trader: Pubkey,
    pub owner: Pubkey,
    pub engine_index: u16,
    pub amount_returned: u64,
    pub now_slot: u64,
}

#[event]
pub struct AccountReclaimed {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub engine_index: u16,
    pub dust_swept: u64,
    pub now_slot: u64,
}

#[event]
pub struct DustGarbageCollected {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub num_closed: u32,
    pub dust_swept: u64,
    pub now_slot: u64,
}

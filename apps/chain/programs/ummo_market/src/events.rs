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

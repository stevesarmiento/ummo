use anchor_lang::prelude::*;

#[account]
pub struct MarketConfig {
    pub authority: Pubkey,
    pub bump: u8,
    pub market_id: u64,
    pub collateral_mint: Pubkey,
    pub oracle_feed: Pubkey,
    pub matcher_authority: Pubkey,
    pub created_at_slot: u64,
}

impl MarketConfig {
    pub const SPACE: usize = 8 + 32 + 1 + 8 + 32 + 32 + 32 + 8;
}

#[account]
pub struct MarketShard {
    pub market: Pubkey,
    pub bump: u8,
    pub shard_id: u16,
    pub shard_seed: Pubkey,
    pub house_engine_index: u16,
    pub created_at_slot: u64,
    pub last_crank_slot: u64,
}

impl MarketShard {
    pub const SPACE: usize = 8 + 32 + 1 + 2 + 32 + 2 + 8 + 8;
}

#[account]
pub struct Trader {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub shard: Pubkey,
    pub bump: u8,
    pub engine_index: u16,
    pub opened_at_slot: u64,
}

impl Trader {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 1 + 2 + 8;
}

#[account]
pub struct LpPool {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub collateral_mint: Pubkey,
    pub bump: u8,
    pub pooled_engine_index: u16,
    pub lp_fee_bps: u16,
    pub protocol_fee_bps: u16,
    pub total_shares: u128,
    pub accounting_nav: u128,
    pub total_deposited: u128,
    pub protocol_fee_accrued: u128,
    pub created_at_slot: u64,
}

impl LpPool {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 1 + 2 + 2 + 2 + 16 + 16 + 16 + 16 + 8;
}

#[account]
pub struct LpPosition {
    pub lp_pool: Pubkey,
    pub owner: Pubkey,
    pub bump: u8,
    pub shares: u128,
    pub deposited_total: u128,
    pub opened_at_slot: u64,
}

impl LpPosition {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 16 + 16 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct QuoteBand {
    pub max_notional: u64,
    pub max_oracle_deviation_bps: u16,
    pub spread_bps: u16,
    pub max_inventory_bps: u16,
}

#[account]
pub struct LpBandConfig {
    pub lp_pool: Pubkey,
    pub owner: Pubkey,
    pub bump: u8,
    pub bands: [QuoteBand; 3],
    pub updated_at_slot: u64,
}

impl LpBandConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + ((8 + 2 + 2 + 2) * 3) + 8;
}

pub const SHARD_ENGINE_BYTES: usize = core::mem::size_of::<percolator::RiskEngine>();

pub struct ShardEngine;

impl ShardEngine {
    pub const SPACE: usize = SHARD_ENGINE_BYTES;
}


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

pub const SHARD_ENGINE_BYTES: usize = core::mem::size_of::<percolator::RiskEngine>();

pub struct ShardEngine;

impl ShardEngine {
    pub const SPACE: usize = SHARD_ENGINE_BYTES;
}


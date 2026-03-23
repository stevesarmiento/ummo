use quasar_lang::prelude::*;

pub const MARKET_SEED: &[u8] = b"market";
pub const SHARD_SEED: &[u8] = b"shard";
pub const ENGINE_SEED: &[u8] = b"engine";
pub const TRADER_SEED: &[u8] = b"trader";

#[account(discriminator = 1)]
pub struct MarketConfig {
    pub authority: Address,
    pub bump: u8,
    pub market_id: u64,
    pub collateral_mint: Address,
    pub oracle_feed: Address,
    pub matcher_authority: Address,
    pub created_at_slot: u64,
}

#[account(discriminator = 2)]
pub struct MarketShard {
    pub market: Address,
    pub bump: u8,
    pub shard_id: u16,
    pub shard_seed: Address,
    /// Engine account index used as the default counterparty for user trades (house LP).
    pub house_engine_index: u16,
    pub created_at_slot: u64,
    pub last_crank_slot: u64,
}

#[account(discriminator = 3)]
pub struct Trader {
    pub owner: Address,
    pub market: Address,
    pub shard: Address,
    pub bump: u8,
    pub engine_index: u16,
    pub opened_at_slot: u64,
}

pub const SHARD_ENGINE_ALIGN_PAD: usize = 7;
pub const SHARD_ENGINE_BYTES: usize = core::mem::size_of::<percolator::RiskEngine>();

#[account(discriminator = 4)]
pub struct ShardEngine {
    pub __align_pad: [u8; SHARD_ENGINE_ALIGN_PAD],
    pub engine: [u8; SHARD_ENGINE_BYTES],
}


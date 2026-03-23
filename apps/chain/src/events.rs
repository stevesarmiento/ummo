use quasar_lang::prelude::*;

#[event(discriminator = 0)]
pub struct MarketInitialized {
    pub market: Address,
    pub shard: Address,
    pub authority: Address,
    pub collateral_mint: Address,
    pub oracle_feed: Address,
    pub matcher_authority: Address,
    pub market_id: u64,
}

#[event(discriminator = 7)]
pub struct ShardInitialized {
    pub market: Address,
    pub shard: Address,
    pub authority: Address,
    pub shard_seed: Address,
    pub shard_id: u16,
    pub house_engine_index: u16,
    pub __pad0: u32,
    pub created_at_slot: u64,
    pub last_crank_slot: u64,
}

#[event(discriminator = 8)]
pub struct MatcherAuthorityUpdated {
    pub market: Address,
    pub authority: Address,
    pub old_matcher_authority: Address,
    pub new_matcher_authority: Address,
    pub now_slot: u64,
}

#[event(discriminator = 1)]
pub struct TraderOpened {
    pub market: Address,
    pub shard: Address,
    pub trader: Address,
    pub owner: Address,
    pub engine_index: u16,
}

#[event(discriminator = 2)]
pub struct DepositEvent {
    pub market: Address,
    pub shard: Address,
    pub trader: Address,
    pub owner: Address,
    pub amount: u64,
    pub engine_index: u16,
    pub __reserved0: u16,
    pub __reserved1: u32,
}

#[event(discriminator = 3)]
pub struct CrankEvent {
    pub market: Address,
    pub shard: Address,
    pub now_slot: u64,
    pub last_crank_slot: u64,
    pub advanced: bool,
    pub __pad0: u8,
    pub __pad1: u8,
    pub __pad2: u8,
    pub __pad3: u8,
    pub __pad4: u8,
    pub __pad5: u8,
    pub __pad6: u8,
}

#[event(discriminator = 4)]
pub struct TradeExecuted {
    pub market: Address,
    pub shard: Address,
    pub trader: Address,
    pub owner: Address,
    pub size_q: i64,
    pub exec_price: u64,
    pub oracle_price: u64,
    pub now_slot: u64,
    pub oracle_posted_slot: u64,
}

#[event(discriminator = 5)]
pub struct WithdrawalEvent {
    pub market: Address,
    pub shard: Address,
    pub trader: Address,
    pub owner: Address,
    pub amount: u64,
    pub engine_index: u16,
    pub __reserved0: u16,
    pub __reserved1: u32,
    pub now_slot: u64,
    pub oracle_price: u64,
    pub oracle_posted_slot: u64,
}

#[event(discriminator = 6)]
pub struct LiquidationEvent {
    pub market: Address,
    pub shard: Address,
    pub keeper: Address,
    pub liquidatee_owner: Address,
    pub liquidatee_engine_index: u16,
    pub liquidated: bool,
    pub __pad0: u8,
    pub __pad1: u32,
    pub old_effective_pos_q: i64,
    pub now_slot: u64,
    pub oracle_price: u64,
    pub oracle_posted_slot: u64,
}


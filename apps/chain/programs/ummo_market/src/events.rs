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

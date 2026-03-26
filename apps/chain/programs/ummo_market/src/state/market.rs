use anchor_lang::prelude::*;

const DISCRIMINATOR_BYTES: usize = 8;
const PUBKEY_BYTES: usize = 32;
const U8_BYTES: usize = 1;
const U16_BYTES: usize = 2;
const U64_BYTES: usize = 8;
const U128_BYTES: usize = 16;

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
    pub const SPACE: usize = DISCRIMINATOR_BYTES
        + PUBKEY_BYTES
        + U8_BYTES
        + U64_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + U64_BYTES;
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
    pub const SPACE: usize = DISCRIMINATOR_BYTES
        + PUBKEY_BYTES
        + U8_BYTES
        + U16_BYTES
        + PUBKEY_BYTES
        + U16_BYTES
        + U64_BYTES
        + U64_BYTES;
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
    pub const SPACE: usize = DISCRIMINATOR_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + U8_BYTES
        + U16_BYTES
        + U64_BYTES;
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
    pub cash_nav: u128,
    pub estimated_nav: u128,
    pub total_deposited: u128,
    pub protocol_fee_accrued: u128,
    pub pending_redemption_shares: u128,
    pub pending_redemption_value: u128,
    pub created_at_slot: u64,
}

impl LpPool {
    pub const SPACE: usize = DISCRIMINATOR_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + U8_BYTES
        + U16_BYTES
        + U16_BYTES
        + U16_BYTES
        + U128_BYTES
        + U128_BYTES
        + U128_BYTES
        + U128_BYTES
        + U128_BYTES
        + U128_BYTES
        + U128_BYTES
        + U128_BYTES
        + U64_BYTES;
}

#[account]
pub struct LpPosition {
    pub lp_pool: Pubkey,
    pub owner: Pubkey,
    pub bump: u8,
    pub shares: u128,
    pub locked_shares: u128,
    pub deposited_total: u128,
    pub pending_withdraw_shares: u128,
    pub pending_withdraw_amount: u128,
    pub pending_withdraw_claimable_at_slot: u64,
    pub opened_at_slot: u64,
}

impl LpPosition {
    pub const SPACE: usize = DISCRIMINATOR_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + U8_BYTES
        + U128_BYTES
        + U128_BYTES
        + U128_BYTES
        + U128_BYTES
        + U128_BYTES
        + U64_BYTES
        + U64_BYTES;
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
    pub const SPACE: usize = DISCRIMINATOR_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + U8_BYTES
        + ((U64_BYTES + U16_BYTES + U16_BYTES + U16_BYTES) * 3)
        + U64_BYTES;
}

pub const SHARD_ENGINE_BYTES: usize = core::mem::size_of::<percolator::RiskEngine>();

pub struct ShardEngine;

impl ShardEngine {
    pub const SPACE: usize = SHARD_ENGINE_BYTES;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_account_space_constants_match_expected_lengths() {
        assert_eq!(MarketConfig::SPACE, 153);
        assert_eq!(MarketShard::SPACE, 93);
        assert_eq!(Trader::SPACE, 115);
        assert_eq!(LpPool::SPACE, 247);
        assert_eq!(LpPosition::SPACE, 169);
        assert_eq!(LpBandConfig::SPACE, 123);
    }
}


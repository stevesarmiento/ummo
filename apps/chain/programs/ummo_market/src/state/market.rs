use anchor_lang::prelude::*;

const DISCRIMINATOR_BYTES: usize = 8;
const PUBKEY_BYTES: usize = 32;
const U8_BYTES: usize = 1;
const U16_BYTES: usize = 2;
const U64_BYTES: usize = 8;
const I64_BYTES: usize = 8;
const U128_BYTES: usize = 16;
const I128_BYTES: usize = 16;

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

#[account]
pub struct RiskState {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub bump: u8,
    /// Half-life (in slots) for symmetric EMA.
    pub sym_half_life_slots: u64,
    /// Half-life (in slots) for directional EMA updates (slow side).
    pub dir_half_life_slots: u64,
    pub ema_sym_price: u64,
    pub ema_dir_down_price: u64,
    pub ema_dir_up_price: u64,
    pub last_oracle_price: u64,
    pub last_update_slot: u64,
}

impl RiskState {
    pub const SPACE: usize = DISCRIMINATOR_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + U8_BYTES
        + U64_BYTES // sym_half_life_slots
        + U64_BYTES // dir_half_life_slots
        + U64_BYTES // ema_sym_price
        + U64_BYTES // ema_dir_down_price
        + U64_BYTES // ema_dir_up_price
        + U64_BYTES // last_oracle_price
        + U64_BYTES; // last_update_slot
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct RailTier {
    pub max_notional: u64,
    pub max_oracle_deviation_bps: u16,
}

#[account]
pub struct MarketRails {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub bump: u8,
    pub tiers: [RailTier; 3],
    pub updated_at_slot: u64,
}

impl MarketRails {
    pub const SPACE: usize = DISCRIMINATOR_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + U8_BYTES
        + ((U64_BYTES + U16_BYTES) * 3)
        + U64_BYTES;
}

#[account]
pub struct FundingState {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub bump: u8,
    pub interval_slots: u64,
    pub last_update_slot: u64,
    pub last_rate_bps_per_slot: i64,
}

impl FundingState {
    pub const SPACE: usize = DISCRIMINATOR_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + U8_BYTES
        + U64_BYTES
        + U64_BYTES
        + I64_BYTES;
}

const MATCHER_ALLOWLIST_MAX: usize = 8;

#[account]
pub struct MatcherAllowlist {
    pub market: Pubkey,
    pub bump: u8,
    pub is_enabled: bool,
    pub matcher_count: u8,
    pub matchers: [Pubkey; MATCHER_ALLOWLIST_MAX],
}

impl MatcherAllowlist {
    pub const SPACE: usize = DISCRIMINATOR_BYTES
        + PUBKEY_BYTES
        + U8_BYTES
        + U8_BYTES
        + U8_BYTES
        + (PUBKEY_BYTES * MATCHER_ALLOWLIST_MAX);
}

#[account]
pub struct LiquidationConfig {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub bump: u8,
    pub is_enabled: bool,
    pub bounty_share_bps: u16,
    pub bounty_cap_abs: u64,
    pub updated_at_slot: u64,
}

impl LiquidationConfig {
    pub const SPACE: usize = DISCRIMINATOR_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + U8_BYTES
        + U8_BYTES
        + U16_BYTES
        + U64_BYTES
        + U64_BYTES;
}

#[account]
pub struct FundingAccumulator {
    pub market: Pubkey,
    pub shard: Pubkey,
    pub bump: u8,
    pub funding_k_long: i128,
    pub funding_k_short: i128,
    pub last_update_slot: u64,
}

impl FundingAccumulator {
    pub const SPACE: usize = DISCRIMINATOR_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + U8_BYTES
        + I128_BYTES
        + I128_BYTES
        + U64_BYTES;
}

#[account]
pub struct TraderFundingState {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub shard: Pubkey,
    pub trader: Pubkey,
    pub bump: u8,
    pub funding_k_long_snap: i128,
    pub funding_k_short_snap: i128,
    pub cumulative_funding_pnl: i128,
    pub last_update_slot: u64,
}

impl TraderFundingState {
    pub const SPACE: usize = DISCRIMINATOR_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + PUBKEY_BYTES
        + U8_BYTES
        + I128_BYTES
        + I128_BYTES
        + I128_BYTES
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
        assert_eq!(RiskState::SPACE, 129);
        assert_eq!(MarketRails::SPACE, 111);
        assert_eq!(FundingState::SPACE, 97);
        assert_eq!(MatcherAllowlist::SPACE, 299);
        assert_eq!(LiquidationConfig::SPACE, 92);
        assert_eq!(FundingAccumulator::SPACE, 113);
        assert_eq!(TraderFundingState::SPACE, 193);
    }
}


pub const MARKET_SEED: &[u8] = b"market";
pub const SHARD_SEED: &[u8] = b"shard";
pub const ENGINE_SEED: &[u8] = b"engine";
pub const TRADER_SEED: &[u8] = b"trader";
pub const LP_POOL_SEED: &[u8] = b"lp_pool";
pub const LP_POSITION_SEED: &[u8] = b"lp_position";
pub const LP_BAND_SEED: &[u8] = b"lp_band";
pub const RISK_STATE_SEED: &[u8] = b"risk_state";
pub const RAILS_SEED: &[u8] = b"rails";
pub const FUNDING_STATE_SEED: &[u8] = b"funding_state";
pub const MATCHER_ALLOWLIST_SEED: &[u8] = b"matcher_allowlist";
pub const LIQUIDATION_CONFIG_SEED: &[u8] = b"liquidation_config";
pub const FUNDING_ACCUMULATOR_SEED: &[u8] = b"funding_accumulator";
pub const TRADER_FUNDING_STATE_SEED: &[u8] = b"trader_funding_state";

pub const USDC_DECIMALS: u8 = 6;
pub const USDC_ONE: u64 = 1_000_000;

pub const MAX_ORACLE_STALENESS_SLOTS: u64 = 10_000;
pub const MAX_CRANK_STALENESS_SLOTS: u64 = 150;
pub const LP_WITHDRAW_COOLDOWN_SLOTS: u64 = 150;
pub const FUNDING_INTERVAL_SLOTS: u64 = 150;

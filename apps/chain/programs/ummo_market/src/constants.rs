pub const MARKET_SEED: &[u8] = b"market";
pub const SHARD_SEED: &[u8] = b"shard";
pub const ENGINE_SEED: &[u8] = b"engine";
pub const TRADER_SEED: &[u8] = b"trader";
pub const LP_POOL_SEED: &[u8] = b"lp_pool";
pub const LP_POSITION_SEED: &[u8] = b"lp_position";
pub const LP_BAND_SEED: &[u8] = b"lp_band";

pub const USDC_DECIMALS: u8 = 6;
pub const USDC_ONE: u64 = 1_000_000;

pub const MAX_ORACLE_STALENESS_SLOTS: u64 = 150;
pub const MAX_CRANK_STALENESS_SLOTS: u64 = 150;
pub const LP_WITHDRAW_COOLDOWN_SLOTS: u64 = 150;

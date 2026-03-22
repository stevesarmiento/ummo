use quasar_lang::prelude::*;

pub const MARKET_ENGINE_MAX_BYTES: usize = 64 * 1024;

#[account(discriminator = 1)]
pub struct Market {
    pub authority: Address,
    pub bump: u8,
    pub created_at_slot: u64,
    pub last_oracle_price: u64,
    pub engine_len: u32,
    pub engine: [u8; MARKET_ENGINE_MAX_BYTES],
}


use anchor_lang::prelude::*;

#[account]
pub struct Market {
    pub authority: Pubkey,
    pub bump: u8,
    pub created_at_slot: u64,
    pub last_oracle_price: u64,
    /// Placeholder: serialized Percolator `RiskEngine` bytes (implementation pending).
    pub engine: Vec<u8>,
}

impl Market {
    pub const ENGINE_MAX_BYTES: usize = 64 * 1024;
    pub const SPACE: usize = 8 + 32 + 1 + 8 + 8 + 4 + Self::ENGINE_MAX_BYTES;
}


use quasar_lang::prelude::*;

use crate::errors::UmmoError;
use crate::state::{ShardEngine, SHARD_ENGINE_ALIGN_PAD};

use percolator::{RiskEngine, RiskParams, U128};

pub const USDC_DECIMALS: u8 = 6;
pub const USDC_ONE: u64 = 1_000_000;

pub fn default_risk_params() -> RiskParams {
    RiskParams {
        warmup_period_slots: 0,
        maintenance_margin_bps: 500,
        initial_margin_bps: 1000,
        trading_fee_bps: 10,
        max_accounts: percolator::MAX_ACCOUNTS as u64,
        new_account_fee: U128::new(0),
        maintenance_fee_per_slot: U128::new(0),
        // ~60s @ ~400ms/slot ≈ 150
        max_crank_staleness_slots: 150,
        liquidation_fee_bps: 50,
        liquidation_fee_cap: U128::new(10_000 * (USDC_ONE as u128)),
        liquidation_buffer_bps: 200,
        min_liquidation_abs: U128::new(USDC_ONE as u128),
        min_initial_deposit: U128::new(USDC_ONE as u128),
        min_nonzero_mm_req: USDC_ONE as u128,
        min_nonzero_im_req: 2 * (USDC_ONE as u128),
    }
}

#[inline(always)]
pub fn borrow_engine_mut<'a>(engine: &'a mut Account<ShardEngine>) -> &'a mut RiskEngine {
    // RiskEngine expects 8-byte alignment on SBF. We align the engine bytes
    // by placing them at offset (discriminator_len=1 + SHARD_ENGINE_ALIGN_PAD=7) = 8.
    let _ = SHARD_ENGINE_ALIGN_PAD;
    let ptr = engine.engine.as_mut_ptr() as *mut RiskEngine;
    unsafe { &mut *ptr }
}

#[inline(always)]
pub fn init_engine(engine: &mut Account<ShardEngine>) {
    let params = default_risk_params();
    borrow_engine_mut(engine).init_in_place(params);
}

#[inline(always)]
pub fn add_house_lp(engine: &mut Account<ShardEngine>, matcher_authority: &Address) -> Result<u16, ProgramError> {
    let mut program = [0u8; 32];
    program.copy_from_slice(matcher_authority.as_ref());

    let idx = borrow_engine_mut(engine)
        .add_lp(program, program, 0)
        .map_err(UmmoError::from)?;

    Ok(idx)
}

#[cfg(test)]
mod tests {
    use super::*;
    extern crate std;

    #[test]
    fn crank_freshness_stale_vs_fresh() {
        let mut engine = std::boxed::Box::new(core::mem::MaybeUninit::<RiskEngine>::uninit());
        let ptr = engine.as_mut_ptr();

        unsafe {
            (*ptr).last_crank_slot = 100;
            (*ptr).max_crank_staleness_slots = 150;
            assert!((&*ptr).require_fresh_crank(250).is_ok());
            assert!((&*ptr).require_fresh_crank(251).is_err());
        }
    }
}


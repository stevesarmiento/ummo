use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};

use crate::{
    constants::USDC_ONE,
    error::UmmoError,
    state::ShardEngine,
};

use percolator::{RiskEngine, RiskParams, U128};

pub fn default_risk_params() -> RiskParams {
    RiskParams {
        warmup_period_slots: 0,
        maintenance_margin_bps: 500,
        initial_margin_bps: 1000,
        trading_fee_bps: 10,
        max_accounts: percolator::MAX_ACCOUNTS as u64,
        new_account_fee: U128::new(0),
        maintenance_fee_per_slot: U128::new(0),
        max_crank_staleness_slots: 100_000_000,
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
fn engine_ptr(data: &mut [u8]) -> *mut RiskEngine {
    data.as_mut_ptr() as *mut RiskEngine
}

#[inline(always)]
pub fn with_engine_mut<T>(
    engine: &UncheckedAccount,
    f: impl FnOnce(&mut RiskEngine) -> Result<T>,
) -> Result<T> {
    let mut data = engine.try_borrow_mut_data()?;
    let ptr = engine_ptr(&mut data);
    unsafe { f(&mut *ptr) }
}

#[inline(always)]
pub fn create_engine_account<'info>(
    payer: &Signer<'info>,
    engine: &UncheckedAccount<'info>,
    system_program: &Program<'info, System>,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let engine_info = engine.to_account_info();
    if engine_info.lamports() != 0 || !engine_info.data_is_empty() {
        return err!(UmmoError::InvalidPda)
    }

    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(ShardEngine::SPACE);
    let ix = system_instruction::create_account(
        &payer.key(),
        engine_info.key,
        lamports,
        ShardEngine::SPACE as u64,
        &crate::ID,
    );
    invoke_signed(
        &ix,
        &[payer.to_account_info(), engine_info, system_program.to_account_info()],
        &[signer_seeds],
    )?;
    Ok(())
}

#[inline(always)]
pub fn init_engine(engine: &UncheckedAccount) -> Result<()> {
    let params = default_risk_params();
    let mut data = engine.try_borrow_mut_data()?;
    let ptr = engine_ptr(&mut data);
    unsafe {
        (&mut *ptr).init_in_place(params);
    }
    Ok(())
}

#[inline(always)]
pub fn add_house_lp(
    engine: &UncheckedAccount,
    matcher_authority: &Pubkey,
) -> Result<u16> {
    let program = matcher_authority.to_bytes();
    let idx = with_engine_mut(engine, |risk_engine| {
        risk_engine
            .add_lp(program, program, 0)
            .map_err(|err| error!(UmmoError::from(err)))
    })?;
    Ok(idx)
}

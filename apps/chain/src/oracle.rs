use quasar_lang::prelude::*;

use crate::errors::UmmoError;

pub const PYTH_RECEIVER_PROGRAM_ID: Address = address!("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

pub const MAX_ORACLE_STALENESS_SLOTS: u64 = 10_000;
pub const MAX_ORACLE_CONFIDENCE_BPS: u64 = 200;
pub const ORACLE_PRICE_DECIMALS: i32 = 6;

pub struct OraclePrice {
    pub price: u64,
    pub conf: u64,
    pub posted_slot: u64,
}

pub struct PythPriceUpdateV2 {
    pub feed_id: [u8; 32],
    pub price: i64,
    pub conf: u64,
    pub exponent: i32,
    pub posted_slot: u64,
    pub verification_level: u8,
}

pub fn read_pyth_price_update_v2(view: &AccountView) -> Result<PythPriceUpdateV2, ProgramError> {
    require!(
        view.owned_by(&PYTH_RECEIVER_PROGRAM_ID),
        UmmoError::InvalidOracleAccount
    );

    let data = view.try_borrow()?;
    require!(data.len() >= 8 + 32 + 1, UmmoError::InvalidOracleAccount);

    // Skip Anchor discriminator (8 bytes) + write_authority (32 bytes).
    let mut cursor = 8 + 32;

    // borsh enum VerificationLevel: Partial { num_signatures: u8 } | Full
    let verification_level = data[cursor];
    cursor += 1;
    match verification_level {
        0 => {
            require!(data.len() >= cursor + 1, UmmoError::InvalidOracleAccount);
            cursor += 1;
        }
        1 => {}
        _ => return Err(UmmoError::InvalidOracleAccount.into()),
    }

    // PriceMessage is fixed-size.
    const PRICE_MESSAGE_LEN: usize = 32 + 8 + 8 + 4 + 8 + 8 + 8 + 8 + 8;
    require!(
        data.len() >= cursor + PRICE_MESSAGE_LEN,
        UmmoError::InvalidOracleAccount
    );

    let mut feed_id = [0u8; 32];
    feed_id.copy_from_slice(&data[cursor..cursor + 32]);
    cursor += 32;

    let price = i64::from_le_bytes(data[cursor..cursor + 8].try_into().unwrap());
    cursor += 8;

    let conf = u64::from_le_bytes(data[cursor..cursor + 8].try_into().unwrap());
    cursor += 8;

    let exponent = i32::from_le_bytes(data[cursor..cursor + 4].try_into().unwrap());
    cursor += 4;

    // publish_time, prev_publish_time, ema_price, ema_conf
    cursor += 8 + 8 + 8 + 8;

    let posted_slot = u64::from_le_bytes(data[cursor..cursor + 8].try_into().unwrap());

    Ok(PythPriceUpdateV2 {
        feed_id,
        price,
        conf,
        exponent,
        posted_slot,
        verification_level,
    })
}

fn pow10(exp: u32) -> Result<u128, ProgramError> {
    let mut v: u128 = 1;
    let mut i = 0u32;
    while i < exp {
        v = v.checked_mul(10).ok_or(UmmoError::OracleInvalidPrice)?;
        i += 1;
    }
    Ok(v)
}

fn scale_i64_to_u64(value: i64, exp10: i32) -> Result<u64, ProgramError> {
    require!(value > 0, UmmoError::OracleInvalidPrice);
    let value = value as i128;

    let scaled = if exp10 >= 0 {
        let mul = pow10(exp10 as u32)? as i128;
        value
            .checked_mul(mul)
            .ok_or(UmmoError::OracleInvalidPrice)?
    } else {
        let div = pow10((-exp10) as u32)? as i128;
        value / div
    };

    u64::try_from(scaled).map_err(|_| UmmoError::OracleInvalidPrice.into())
}

fn scale_u64(value: u64, exp10: i32) -> Result<u64, ProgramError> {
    let value = value as u128;

    let scaled = if exp10 >= 0 {
        let mul = pow10(exp10 as u32)?;
        value
            .checked_mul(mul)
            .ok_or(UmmoError::OracleInvalidPrice)?
    } else {
        let div = pow10((-exp10) as u32)?;
        value / div
    };

    u64::try_from(scaled).map_err(|_| UmmoError::OracleInvalidPrice.into())
}

pub fn get_oracle_price_1e6(view: &AccountView, now_slot: u64) -> Result<OraclePrice, ProgramError> {
    let update = read_pyth_price_update_v2(view)?;
    require!(
        update.verification_level == 1,
        UmmoError::InvalidOracleAccount
    );

    require!(now_slot >= update.posted_slot, UmmoError::OracleStale);
    require!(
        now_slot - update.posted_slot <= MAX_ORACLE_STALENESS_SLOTS,
        UmmoError::OracleStale
    );

    let exp10 = update.exponent + ORACLE_PRICE_DECIMALS;
    let price = scale_i64_to_u64(update.price, exp10)?;
    let conf = scale_u64(update.conf, exp10)?;

    let max_conf = price.saturating_mul(MAX_ORACLE_CONFIDENCE_BPS) / 10_000;
    require!(conf <= max_conf, UmmoError::OracleConfidenceTooWide);

    Ok(OraclePrice {
        price,
        conf,
        posted_slot: update.posted_slot,
    })
}


use anchor_lang::prelude::*;

use crate::error::UmmoError;

pub const PYTH_RECEIVER_PROGRAM_ID: Pubkey =
    pubkey!("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

pub const MAX_ORACLE_STALENESS_SLOTS: u64 = 100_000_000;
pub const MAX_ORACLE_CONFIDENCE_BPS: u64 = 200;
pub const ORACLE_PRICE_DECIMALS: i32 = 6;

pub struct OraclePrice {
    pub price: u64,
    pub posted_slot: u64,
}

pub fn get_oracle_price_1e6(account: &UncheckedAccount, now_slot: u64) -> Result<OraclePrice> {
    require_keys_eq!(*account.owner, PYTH_RECEIVER_PROGRAM_ID, UmmoError::InvalidOracleAccount);
    let data = account.try_borrow_data()?;
    require!(data.len() >= 8 + 32 + 1, UmmoError::InvalidOracleAccount);

    let mut cursor = 8 + 32;
    let verification_level = data[cursor];
    cursor += 1;
    match verification_level {
        0 => {
            require!(data.len() >= cursor + 1, UmmoError::InvalidOracleAccount);
            cursor += 1;
        }
        1 => {}
        _ => return err!(UmmoError::InvalidOracleAccount),
    }

    const PRICE_MESSAGE_LEN: usize = 32 + 8 + 8 + 4 + 8 + 8 + 8 + 8 + 8;
    require!(data.len() >= cursor + PRICE_MESSAGE_LEN, UmmoError::InvalidOracleAccount);

    cursor += 32;
    let price = i64::from_le_bytes(
        data[cursor..cursor + 8]
            .try_into()
            .map_err(|_| error!(UmmoError::InvalidOracleAccount))?,
    );
    cursor += 8;
    let conf = u64::from_le_bytes(
        data[cursor..cursor + 8]
            .try_into()
            .map_err(|_| error!(UmmoError::InvalidOracleAccount))?,
    );
    cursor += 8;
    let exponent = i32::from_le_bytes(
        data[cursor..cursor + 4]
            .try_into()
            .map_err(|_| error!(UmmoError::InvalidOracleAccount))?,
    );
    cursor += 4;
    cursor += 8 + 8 + 8 + 8;
    let posted_slot = u64::from_le_bytes(
        data[cursor..cursor + 8]
            .try_into()
            .map_err(|_| error!(UmmoError::InvalidOracleAccount))?,
    );

    require!(now_slot >= posted_slot, UmmoError::OracleStale);
    require!(now_slot - posted_slot <= MAX_ORACLE_STALENESS_SLOTS, UmmoError::OracleStale);
    require!(price > 0, UmmoError::OracleInvalidPrice);

    let exp10 = exponent + ORACLE_PRICE_DECIMALS;
    let scaled_price = if exp10 >= 0 {
        let mul = 10u128.pow(exp10 as u32);
        (price as i128)
            .checked_mul(mul as i128)
            .and_then(|v| u64::try_from(v).ok())
            .ok_or_else(|| error!(UmmoError::OracleInvalidPrice))?
    } else {
        (price as i128 / 10i128.pow((-exp10) as u32))
            .try_into()
            .map_err(|_| error!(UmmoError::OracleInvalidPrice))?
    };
    let scaled_conf = if exp10 >= 0 {
        conf.checked_mul(10u64.pow(exp10 as u32))
            .ok_or_else(|| error!(UmmoError::OracleInvalidPrice))?
    } else {
        conf / 10u64.pow((-exp10) as u32)
    };

    let max_conf = scaled_price.saturating_mul(MAX_ORACLE_CONFIDENCE_BPS) / 10_000;
    require!(scaled_conf <= max_conf, UmmoError::OracleConfidenceTooWide);

    Ok(OraclePrice {
        price: scaled_price,
        posted_slot,
    })
}

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke};

use crate::error::UmmoError;

pub const TOKEN_PROGRAM_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const TOKEN_ACCOUNT_DATA_LEN: usize = 165;

pub struct TokenAccountInfo {
    pub mint: Pubkey,
    pub owner: Pubkey,
}

pub fn read_token_account(account: &UncheckedAccount) -> Result<TokenAccountInfo> {
    require_keys_eq!(*account.owner, TOKEN_PROGRAM_ID, UmmoError::InvalidTokenAccount);
    let data = account.try_borrow_data()?;
    require!(data.len() >= TOKEN_ACCOUNT_DATA_LEN, UmmoError::InvalidTokenAccount);

    let mint = Pubkey::new_from_array(
        data[0..32]
            .try_into()
            .map_err(|_| error!(UmmoError::InvalidTokenAccount))?,
    );
    let owner = Pubkey::new_from_array(
        data[32..64]
            .try_into()
            .map_err(|_| error!(UmmoError::InvalidTokenAccount))?,
    );

    Ok(TokenAccountInfo { mint, owner })
}

pub fn spl_token_transfer<'info>(
    token_program: &UncheckedAccount<'info>,
    source: &UncheckedAccount<'info>,
    destination: &UncheckedAccount<'info>,
    authority: &Signer<'info>,
    amount: u64,
) -> Result<()> {
    require_keys_eq!(token_program.key(), TOKEN_PROGRAM_ID, UmmoError::InvalidTokenProgram);

    let mut data = [0u8; 9];
    data[0] = 3;
    data[1..9].copy_from_slice(&amount.to_le_bytes());

    let ix = Instruction {
        program_id: TOKEN_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(source.key(), false),
            AccountMeta::new(destination.key(), false),
            AccountMeta::new_readonly(authority.key(), true),
        ],
        data: data.to_vec(),
    };

    invoke(
        &ix,
        &[
            source.to_account_info(),
            destination.to_account_info(),
            authority.to_account_info(),
        ],
    )?;

    Ok(())
}

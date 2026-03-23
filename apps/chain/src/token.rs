use quasar_lang::prelude::*;

use crate::errors::UmmoError;
use quasar_lang::cpi::{CpiCall, InstructionAccount, Seed};

pub const TOKEN_PROGRAM_ID: Address = address!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const ASSOCIATED_TOKEN_PROGRAM_ID: Address =
    address!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

pub const TOKEN_ACCOUNT_DATA_LEN: usize = 165;

pub struct TokenAccountInfo {
    pub mint: Address,
    pub owner: Address,
    pub amount: u64,
}

pub fn read_token_account(view: &AccountView) -> Result<TokenAccountInfo, ProgramError> {
    require!(view.owned_by(&TOKEN_PROGRAM_ID), UmmoError::InvalidTokenAccount);
    require!(
        view.data_len() >= TOKEN_ACCOUNT_DATA_LEN,
        UmmoError::InvalidTokenAccount
    );

    let data = view.try_borrow()?;

    let mint = {
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(&data[0..32]);
        Address::new_from_array(bytes)
    };
    let owner = {
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(&data[32..64]);
        Address::new_from_array(bytes)
    };
    let amount = u64::from_le_bytes(data[64..72].try_into().unwrap());

    Ok(TokenAccountInfo { mint, owner, amount })
}

pub fn derive_associated_token_address(owner: &Address, mint: &Address) -> Result<Address, ProgramError> {
    let seeds: [&[u8]; 3] = [owner.as_ref(), TOKEN_PROGRAM_ID.as_ref(), mint.as_ref()];
    let (ata, _bump) = quasar_lang::pda::based_try_find_program_address(&seeds, &ASSOCIATED_TOKEN_PROGRAM_ID)?;
    Ok(ata)
}

pub fn spl_token_transfer(
    token_program: &UncheckedAccount,
    source: &mut UncheckedAccount,
    destination: &mut UncheckedAccount,
    authority: &Signer,
    amount: u64,
) -> Result<(), ProgramError> {
    require_keys_eq!(token_program.address(), &TOKEN_PROGRAM_ID, UmmoError::InvalidTokenProgram);
    require!(amount > 0, UmmoError::InvalidAmount);

    let mut data = [0u8; 9];
    data[0] = 3;
    data[1..9].copy_from_slice(&amount.to_le_bytes());

    let cpi = CpiCall::new(
        token_program.address(),
        [
            InstructionAccount::writable(source.address()),
            InstructionAccount::writable(destination.address()),
            InstructionAccount::readonly_signer(authority.address()),
        ],
        [
            source.to_account_view(),
            destination.to_account_view(),
            authority.to_account_view(),
        ],
        data,
    );

    cpi.invoke()
}

pub fn spl_token_transfer_signed(
    token_program: &UncheckedAccount,
    source: &mut UncheckedAccount,
    destination: &mut UncheckedAccount,
    authority: &impl AsAccountView,
    authority_address: &Address,
    authority_seeds: &[Seed],
    amount: u64,
) -> Result<(), ProgramError> {
    require_keys_eq!(token_program.address(), &TOKEN_PROGRAM_ID, UmmoError::InvalidTokenProgram);
    require!(amount > 0, UmmoError::InvalidAmount);

    let mut data = [0u8; 9];
    data[0] = 3;
    data[1..9].copy_from_slice(&amount.to_le_bytes());

    let cpi = CpiCall::new(
        token_program.address(),
        [
            InstructionAccount::writable(source.address()),
            InstructionAccount::writable(destination.address()),
            InstructionAccount::readonly_signer(authority_address),
        ],
        [
            source.to_account_view(),
            destination.to_account_view(),
            authority.to_account_view(),
        ],
        data,
    );

    cpi.invoke_signed(authority_seeds)
}


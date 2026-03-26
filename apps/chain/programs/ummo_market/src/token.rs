use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::error::UmmoError;

pub const TOKEN_PROGRAM_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const TOKEN_2022_PROGRAM_ID: Pubkey =
    pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

pub fn validate_supported_token_program(token_program_id: Pubkey) -> Result<()> {
    require!(
        token_program_id == TOKEN_PROGRAM_ID || token_program_id == TOKEN_2022_PROGRAM_ID,
        UmmoError::InvalidTokenProgram
    );
    Ok(())
}

pub fn validate_token_program_for_mint<'info>(
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
) -> Result<()> {
    validate_supported_token_program(token_program.key())?;
    require_keys_eq!(
        token_program.key(),
        *mint.to_account_info().owner,
        UmmoError::InvalidTokenProgram
    );
    Ok(())
}

pub fn spl_token_transfer<'info>(
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    source: &InterfaceAccount<'info, TokenAccount>,
    destination: &InterfaceAccount<'info, TokenAccount>,
    authority: &Signer<'info>,
    amount: u64,
) -> Result<()> {
    validate_token_program_for_mint(token_program, mint)?;

    let cpi_accounts = TransferChecked {
        mint: mint.to_account_info(),
        from: source.to_account_info(),
        to: destination.to_account_info(),
        authority: authority.to_account_info(),
    };
    let cpi_context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
    token_interface::transfer_checked(cpi_context, amount, mint.decimals)?;
    Ok(())
}

pub fn spl_token_transfer_signed<'info>(
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    source: &InterfaceAccount<'info, TokenAccount>,
    destination: &InterfaceAccount<'info, TokenAccount>,
    authority: &AccountInfo<'info>,
    signer_seeds: &[&[u8]],
    amount: u64,
) -> Result<()> {
    validate_token_program_for_mint(token_program, mint)?;

    let cpi_accounts = TransferChecked {
        mint: mint.to_account_info(),
        from: source.to_account_info(),
        to: destination.to_account_info(),
        authority: authority.clone(),
    };
    let signer_seed_groups = [signer_seeds];
    let cpi_context = CpiContext::new(token_program.to_account_info(), cpi_accounts)
        .with_signer(&signer_seed_groups);
    token_interface::transfer_checked(cpi_context, amount, mint.decimals)?;
    Ok(())
}

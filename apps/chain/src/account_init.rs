use quasar_lang::{
    cpi::system::SYSTEM_PROGRAM_ID,
    prelude::*,
};

unsafe fn unchecked_account_view_mut_ptr(account: &UncheckedAccount) -> *mut AccountView {
    account as *const UncheckedAccount as *mut AccountView
}

pub fn init_pda_account<'a, T>(
    system_program: &'a Program<System>,
    payer: &'a Signer,
    account: &'a UncheckedAccount,
    signer_seeds: &[Seed],
) -> Result<&'a mut Account<T>, ProgramError>
where
    T: AccountCheck + CheckOwner + Discriminator + Space,
{
    let account_view = account.to_account_view();

    if account_view.lamports() != 0
        || account_view.data_len() != 0
        || !account_view.owned_by(&SYSTEM_PROGRAM_ID)
    {
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    system_program
        .create_account_with_minimum_balance(payer, account, T::SPACE as u64, &crate::ID, None)?
        .invoke_signed(signer_seeds)?;

    let account_view = unsafe { unchecked_account_view_mut_ptr(account) };

    unsafe {
        core::ptr::copy_nonoverlapping(
            T::DISCRIMINATOR.as_ptr(),
            (*account_view).data_mut_ptr(),
            T::DISCRIMINATOR.len(),
        );
    }

    Ok(unsafe { &mut *(account_view as *mut Account<T>) })
}

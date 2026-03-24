use quasar_lang::prelude::*;

#[derive(Accounts)]
pub struct TestWritable<'info> {
    #[account(mut)]
    pub payer: &'info Signer,

    #[account(mut)]
    pub acct: &'info UncheckedAccount,
}

impl<'info> TestWritable<'info> {
    #[inline(always)]
    pub fn test_writable(&mut self) -> Result<(), ProgramError> {
        quasar_lang::__internal::log_str("test_writable handler");

        if self.payer.to_account_view().is_writable() {
            quasar_lang::__internal::log_str("payer is writable");
        } else {
            quasar_lang::__internal::log_str("payer is readonly");
        }

        if self.acct.to_account_view().is_writable() {
            quasar_lang::__internal::log_str("acct is writable");
        } else {
            quasar_lang::__internal::log_str("acct is readonly");
        }

        Ok(())
    }
}


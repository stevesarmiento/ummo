use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market"],
        bump = market.bump
    )]
    pub market: Account<'info, crate::Market>,
}

pub fn handler(_ctx: Context<Deposit>, _amount: u64) -> Result<()> {
    Ok(())
}


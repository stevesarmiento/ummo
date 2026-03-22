use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ExecuteTrade<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market"],
        bump = market.bump
    )]
    pub market: Account<'info, crate::Market>,
}

pub fn handler(_ctx: Context<ExecuteTrade>, _oracle_price: u64, _exec_price: u64, _size_q: i128) -> Result<()> {
    Ok(())
}


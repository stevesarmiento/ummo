use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct LiquidateAtOracle<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market"],
        bump = market.bump
    )]
    pub market: Account<'info, crate::Market>,
}

pub fn handler(_ctx: Context<LiquidateAtOracle>, _liquidatee_engine_idx: u16, _oracle_price: u64, _now_slot: u64) -> Result<()> {
    Ok(())
}


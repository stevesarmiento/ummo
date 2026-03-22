use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitMarket<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = crate::Market::SPACE,
        seeds = [b"market"],
        bump
    )]
    pub market: Account<'info, crate::Market>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitMarket>, initial_oracle_price: u64) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.authority = ctx.accounts.payer.key();
    market.bump = ctx.bumps.market;
    market.created_at_slot = Clock::get()?.slot;
    market.last_oracle_price = initial_oracle_price;
    market.engine = Vec::new();

    Ok(())
}

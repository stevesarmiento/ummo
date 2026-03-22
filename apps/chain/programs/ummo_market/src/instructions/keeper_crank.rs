use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct KeeperCrank<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market"],
        bump = market.bump
    )]
    pub market: Account<'info, crate::Market>,
}

pub fn handler(
    _ctx: Context<KeeperCrank>,
    _now_slot: u64,
    _oracle_price: u64,
    _ordered_candidates: Vec<u16>,
    _max_revalidations: u16,
) -> Result<()> {
    Ok(())
}


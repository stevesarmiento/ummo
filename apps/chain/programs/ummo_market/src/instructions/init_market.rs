use anchor_lang::prelude::*;

use crate::{
    constants::{MARKET_SEED, SHARD_SEED},
    events::MarketInitialized,
    state::MarketConfig,
};

#[derive(Accounts)]
pub struct InitMarket<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: validated in client and stored verbatim.
    pub collateral_mint: UncheckedAccount<'info>,

    /// CHECK: validated in client and stored verbatim.
    pub oracle_feed: UncheckedAccount<'info>,

    /// CHECK: stored as the authorized matcher signer.
    pub matcher_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = MarketConfig::SPACE,
        seeds = [MARKET_SEED, oracle_feed.key().as_ref()],
        bump
    )]
    pub market: Account<'info, MarketConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitMarket>, market_id: u64) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let authority = ctx.accounts.payer.key();
    let collateral_mint = ctx.accounts.collateral_mint.key();
    let oracle_feed = ctx.accounts.oracle_feed.key();
    let matcher_authority = ctx.accounts.matcher_authority.key();

    market.authority = ctx.accounts.payer.key();
    market.bump = ctx.bumps.market;
    market.market_id = market_id;
    market.collateral_mint = collateral_mint;
    market.oracle_feed = oracle_feed;
    market.matcher_authority = matcher_authority;
    market.created_at_slot = Clock::get()?.slot;

    let (shard, _) = Pubkey::find_program_address(
        &[SHARD_SEED, market.key().as_ref(), oracle_feed.as_ref()],
        &crate::ID,
    );

    emit!(MarketInitialized {
        market: market.key(),
        shard,
        authority,
        collateral_mint,
        oracle_feed,
        matcher_authority,
        market_id,
    });

    Ok(())
}

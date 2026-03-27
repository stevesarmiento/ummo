use anchor_lang::prelude::*;

use crate::{
    constants::{MARKET_SEED, MATCHER_ALLOWLIST_SEED},
    error::UmmoError,
    state::{MarketConfig, MatcherAllowlist},
};

#[derive(Accounts)]
pub struct SetMatcherAllowlist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: used only for market PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = MatcherAllowlist::SPACE,
        seeds = [MATCHER_ALLOWLIST_SEED, market.key().as_ref()],
        bump
    )]
    pub matcher_allowlist: Account<'info, MatcherAllowlist>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SetMatcherAllowlist>, is_enabled: bool, matchers: Vec<Pubkey>) -> Result<()> {
    require_keys_eq!(ctx.accounts.market.authority, ctx.accounts.authority.key(), UmmoError::Unauthorized);
    require!(matchers.len() <= 8, UmmoError::InvalidAmount);

    ctx.accounts.matcher_allowlist.market = ctx.accounts.market.key();
    ctx.accounts.matcher_allowlist.bump = ctx.bumps.matcher_allowlist;
    ctx.accounts.matcher_allowlist.is_enabled = is_enabled;
    ctx.accounts.matcher_allowlist.matcher_count = matchers.len() as u8;

    let mut out = [Pubkey::default(); 8];
    for (i, key) in matchers.into_iter().enumerate() {
        out[i] = key;
    }
    ctx.accounts.matcher_allowlist.matchers = out;
    Ok(())
}


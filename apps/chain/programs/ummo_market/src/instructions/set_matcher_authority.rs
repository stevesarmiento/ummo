use anchor_lang::prelude::*;

use crate::{
    constants::MARKET_SEED,
    error::UmmoError,
    events::MatcherAuthorityUpdated,
    state::MarketConfig,
};

#[derive(Accounts)]
pub struct SetMatcherAuthority<'info> {
    pub signer: Signer<'info>,

    /// CHECK: used only for market PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, oracle_feed.key().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, MarketConfig>,

    /// CHECK: stored as the new matcher authority.
    pub new_matcher_authority: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<SetMatcherAuthority>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.market.authority,
        ctx.accounts.signer.key(),
        UmmoError::Unauthorized
    );

    let old = ctx.accounts.market.matcher_authority;
    let next = ctx.accounts.new_matcher_authority.key();
    ctx.accounts.market.matcher_authority = next;

    emit!(MatcherAuthorityUpdated {
        market: ctx.accounts.market.key(),
        authority: ctx.accounts.signer.key(),
        old_matcher_authority: old,
        new_matcher_authority: next,
        now_slot: Clock::get()?.slot,
    });

    Ok(())
}

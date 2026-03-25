use quasar_lang::prelude::*;

use crate::{
    account_init::init_pda_account,
    engine::borrow_engine_mut,
    errors::UmmoError,
    events::TraderOpened,
    state::{MarketConfig, MarketShard, ShardEngine, Trader, ENGINE_SEED, MARKET_SEED, TRADER_SEED},
};

#[derive(Accounts)]
pub struct OpenTrader<'info> {
    #[account(mut)]
    pub signer: &'info Signer,

    pub oracle_feed: &'info UncheckedAccount,

    #[account(seeds = [MARKET_SEED, oracle_feed], bump = market.bump)]
    pub market: &'info Account<MarketConfig>,

    pub shard: &'info Account<MarketShard>,

    #[account(mut, seeds = [ENGINE_SEED, shard], bump)]
    pub engine: &'info mut Account<ShardEngine>,

    #[account(mut, seeds = [TRADER_SEED, shard, signer], bump)]
    pub trader: &'info UncheckedAccount,

    pub system_program: &'info Program<System>,
    pub clock: &'info Sysvar<Clock>,
}

impl<'info> OpenTrader<'info> {
    #[inline(always)]
    pub fn open_trader(&mut self, bumps: &OpenTraderBumps) -> Result<(), ProgramError> {
        require_keys_eq!(self.shard.market, *self.market.address(), UmmoError::Unauthorized);
        let trader_address = *self.trader.address();
        let trader_bump = [bumps.trader];
        let trader_seeds = [
            Seed::from(TRADER_SEED),
            Seed::from(self.shard.address().as_ref()),
            Seed::from(self.signer.address().as_ref()),
            Seed::from(&trader_bump),
        ];
        let trader = init_pda_account::<Trader>(
            self.system_program,
            self.signer,
            self.trader,
            &trader_seeds,
        )?;

        let idx = borrow_engine_mut(self.engine)
            .add_user(0)
            .map_err(crate::errors::UmmoError::from)?;

        borrow_engine_mut(self.engine)
            .set_owner(idx, *self.signer.address().as_array())
            .map_err(crate::errors::UmmoError::from)?;

        trader.owner = *self.signer.address();
        trader.market = *self.market.address();
        trader.shard = *self.shard.address();
        trader.bump = bumps.trader;
        trader.engine_index = PodU16::from(idx);
        trader.opened_at_slot = self.clock.slot;

        emit!(TraderOpened {
            market: *self.market.address(),
            shard: *self.shard.address(),
            trader: trader_address,
            owner: *self.signer.address(),
            engine_index: idx,
        });

        Ok(())
    }
}


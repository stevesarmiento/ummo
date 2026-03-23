use quasar_lang::prelude::*;

use crate::{
    engine::borrow_engine_mut,
    errors::UmmoError,
    events::CrankEvent,
    state::{MarketConfig, MarketShard, ShardEngine, ENGINE_SEED, MARKET_SEED},
};

#[derive(Accounts)]
pub struct KeeperCrank<'info> {
    pub signer: &'info Signer,

    pub oracle_feed: &'info UncheckedAccount,

    #[account(seeds = [MARKET_SEED, oracle_feed], bump = market.bump)]
    pub market: &'info Account<MarketConfig>,

    pub shard: &'info mut Account<MarketShard>,

    #[account(mut, seeds = [ENGINE_SEED, shard], bump)]
    pub engine: &'info mut Account<ShardEngine>,

    pub clock: &'info Sysvar<Clock>,
}

impl<'info> KeeperCrank<'info> {
    #[inline(always)]
    pub fn keeper_crank(
        &mut self,
        _now_slot: u64,
        oracle_price: u64,
        ordered_candidates: &[[u8; 2]],
        max_revalidations: u16,
    ) -> Result<(), ProgramError> {
        require_keys_eq!(self.shard.market, *self.market.address(), UmmoError::Unauthorized);

        let now_slot = self.clock.slot.get();

        let mut candidate_buf = [0u16; 512];
        let mut n = 0usize;
        for bytes in ordered_candidates {
            if n >= candidate_buf.len() {
                break;
            }
            candidate_buf[n] = u16::from_le_bytes(*bytes);
            n += 1;
        }

        let (advanced, last_crank_slot) = {
            let engine = borrow_engine_mut(self.engine);
            let outcome = engine
                .keeper_crank(now_slot, oracle_price, &candidate_buf[..n], max_revalidations)
                .map_err(UmmoError::from)?;
            (outcome.advanced, engine.last_crank_slot)
        };

        self.shard.last_crank_slot = PodU64::from(last_crank_slot);

        emit!(CrankEvent {
            market: *self.market.address(),
            shard: *self.shard.address(),
            now_slot,
            last_crank_slot,
            advanced,
            __pad0: 0,
            __pad1: 0,
            __pad2: 0,
            __pad3: 0,
            __pad4: 0,
            __pad5: 0,
            __pad6: 0,
        });

        Ok(())
    }
}


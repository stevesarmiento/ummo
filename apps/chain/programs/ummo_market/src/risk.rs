use anchor_lang::prelude::*;

use crate::{error::UmmoError, state::RiskState};

fn ema_linear_update(prev: u64, price: u64, dt: u64, half_life_slots: u64) -> u64 {
    if prev == 0 || half_life_slots == 0 {
        return price;
    }
    if dt == 0 || prev == price {
        return prev;
    }

    // Linear approximation: move a dt/half_life fraction toward price.
    let step = core::cmp::min(dt, half_life_slots);
    let num = step as u128;
    let den = half_life_slots as u128;

    if price > prev {
        let delta = (price - prev) as u128;
        prev.saturating_add(((delta * num) / den) as u64)
    } else {
        let delta = (prev - price) as u128;
        prev.saturating_sub(((delta * num) / den) as u64)
    }
}

/// Update on-chain risk EMA state and return the conservative risk price.
///
/// Current v1 policy (Omnipair-inspired):
/// - symmetric EMA smooths both directions
/// - directional-down EMA snaps down immediately, rises slowly
/// - risk price uses the pessimistic minimum of the two
pub fn update_risk_state_and_get_price_1e6(
    state: &mut RiskState,
    oracle_price_1e6: u64,
    now_slot: u64,
) -> Result<u64> {
    require!(oracle_price_1e6 > 0, UmmoError::InvalidAmount);
    require!(now_slot >= state.last_update_slot, UmmoError::RiskOverflow);

    let dt = now_slot.saturating_sub(state.last_update_slot);

    if state.ema_sym_price == 0 {
        state.ema_sym_price = oracle_price_1e6;
    } else {
        state.ema_sym_price =
            ema_linear_update(state.ema_sym_price, oracle_price_1e6, dt, state.sym_half_life_slots);
    }

    if state.ema_dir_down_price == 0 {
        state.ema_dir_down_price = oracle_price_1e6;
    } else if oracle_price_1e6 < state.ema_dir_down_price {
        state.ema_dir_down_price = oracle_price_1e6; // snap down
    } else {
        state.ema_dir_down_price = ema_linear_update(
            state.ema_dir_down_price,
            oracle_price_1e6,
            dt,
            state.dir_half_life_slots,
        );
    }

    // Track a symmetric “snap-up” mirror as well for future per-side risk policies.
    if state.ema_dir_up_price == 0 {
        state.ema_dir_up_price = oracle_price_1e6;
    } else if oracle_price_1e6 > state.ema_dir_up_price {
        state.ema_dir_up_price = oracle_price_1e6; // snap up
    } else {
        state.ema_dir_up_price = ema_linear_update(
            state.ema_dir_up_price,
            oracle_price_1e6,
            dt,
            state.dir_half_life_slots,
        );
    }

    state.last_oracle_price = oracle_price_1e6;
    state.last_update_slot = now_slot;

    Ok(core::cmp::min(state.ema_sym_price, state.ema_dir_down_price))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn directional_snaps_down() {
        let mut state = RiskState {
            market: Pubkey::new_unique(),
            shard: Pubkey::new_unique(),
            bump: 0,
            sym_half_life_slots: 100,
            dir_half_life_slots: 10,
            ema_sym_price: 1_000_000,
            ema_dir_down_price: 1_000_000,
            ema_dir_up_price: 1_000_000,
            last_oracle_price: 1_000_000,
            last_update_slot: 0,
        };

        let price = update_risk_state_and_get_price_1e6(&mut state, 900_000, 1).unwrap();
        assert_eq!(state.ema_dir_down_price, 900_000);
        assert_eq!(price, 900_000);
    }
}


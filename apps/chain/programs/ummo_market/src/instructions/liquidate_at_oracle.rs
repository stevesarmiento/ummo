use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    constants::{
        ENGINE_SEED,
        LIQUIDATION_CONFIG_SEED,
        MARKET_SEED,
        RISK_STATE_SEED,
        SHARD_SEED,
        USDC_ONE,
    },
    engine::with_engine_mut,
    error::UmmoError,
    events::{LiquidationBountyPaid, LiquidationEvent},
    oracle::get_oracle_price_1e6,
    risk::update_risk_state_and_get_price_1e6,
    state::{LiquidationConfig, MarketConfig, MarketShard, RiskState},
    token::{spl_token_transfer_signed, validate_token_program_for_mint},
};

const DEFAULT_LIQ_BOUNTY_SHARE_BPS: u16 = 2_000; // 20% of liquidation fee
const DEFAULT_LIQ_BOUNTY_CAP_ABS: u64 = 50 * USDC_ONE;

fn compute_capped_liquidation_fee(notional: u128, liquidation_fee_bps: u64, min_abs: u128, cap: u128) -> u128 {
    let bps = liquidation_fee_bps as u128;
    let mut liq_fee = if notional > 0 && bps > 0 {
        (notional * bps + 9_999) / 10_000
    } else {
        0u128
    };
    liq_fee = liq_fee.max(min_abs);
    liq_fee = liq_fee.min(cap);
    liq_fee
}

fn compute_bounty_from_liquidation_fee(liq_fee: u128, bounty_share_bps: u16, bounty_cap_abs: u64) -> u128 {
    if liq_fee == 0 {
        return 0;
    }
    let share = bounty_share_bps as u128;
    let mut bounty = (liq_fee * share) / 10_000;
    let cap = bounty_cap_abs as u128;
    if bounty > cap {
        bounty = cap;
    }
    if bounty > liq_fee {
        bounty = liq_fee;
    }
    bounty
}

fn compute_bounty_payment(bounty: u128, insurance_balance: u128, insurance_floor: u128, vault_balance: u128) -> u128 {
    let avail_ins = insurance_balance.saturating_sub(insurance_floor);
    bounty.min(avail_ins).min(vault_balance)
}

#[derive(Accounts)]
pub struct LiquidateAtOracle<'info> {
    pub signer: Signer<'info>,

    /// CHECK: used only for market PDA derivation.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(seeds = [MARKET_SEED, oracle_feed.key().as_ref()], bump = market.bump)]
    pub market: Account<'info, MarketConfig>,

    #[account(seeds = [SHARD_SEED, market.key().as_ref(), shard.shard_seed.as_ref()], bump = shard.bump)]
    pub shard: Account<'info, MarketShard>,

    #[account(mut, seeds = [RISK_STATE_SEED, shard.key().as_ref()], bump = risk_state.bump)]
    pub risk_state: Account<'info, RiskState>,

    /// CHECK: engine account is validated by PDA seeds.
    #[account(mut, seeds = [ENGINE_SEED, shard.key().as_ref()], bump)]
    pub engine: UncheckedAccount<'info>,

    #[account(seeds = [LIQUIDATION_CONFIG_SEED, shard.key().as_ref()], bump)]
    pub liquidation_config: Option<Account<'info, LiquidationConfig>>,

    pub collateral_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub keeper_collateral: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub vault_collateral: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn handler(ctx: Context<LiquidateAtOracle>, liquidatee_engine_idx: u16) -> Result<()> {
    require!(
        (liquidatee_engine_idx as usize) < percolator::MAX_ACCOUNTS,
        UmmoError::InvalidAmount
    );
    require_keys_eq!(
        ctx.accounts.shard.market,
        ctx.accounts.market.key(),
        UmmoError::Unauthorized
    );

    validate_token_program_for_mint(&ctx.accounts.token_program, &ctx.accounts.collateral_mint)?;
    require_keys_eq!(
        ctx.accounts.vault_collateral.owner,
        ctx.accounts.shard.key(),
        UmmoError::InvalidVaultAccount
    );
    require_keys_eq!(
        ctx.accounts.vault_collateral.mint,
        ctx.accounts.collateral_mint.key(),
        UmmoError::InvalidVaultAccount
    );
    require_keys_eq!(
        ctx.accounts.keeper_collateral.mint,
        ctx.accounts.collateral_mint.key(),
        UmmoError::InvalidTokenAccount
    );

    let now_slot = ctx.accounts.clock.slot;
    let oracle = get_oracle_price_1e6(&ctx.accounts.oracle_feed, now_slot)?;
    let risk_price = update_risk_state_and_get_price_1e6(
        &mut ctx.accounts.risk_state,
        oracle.price,
        now_slot,
    )?;

    let (bounty_share_bps, bounty_cap_abs) = match ctx.accounts.liquidation_config.as_ref() {
        Some(config) if config.is_enabled => (config.bounty_share_bps, config.bounty_cap_abs),
        _ => (DEFAULT_LIQ_BOUNTY_SHARE_BPS, DEFAULT_LIQ_BOUNTY_CAP_ABS),
    };

    let (liquidated, liquidatee_owner, old_effective_pos_q, bounty_paid) =
        with_engine_mut(&ctx.accounts.engine, |risk_engine| {
            risk_engine
                .require_fresh_crank(now_slot)
                .map_err(|err| error!(UmmoError::from(err)))?;

            let idx = liquidatee_engine_idx as usize;
            let liquidatee_owner = Pubkey::new_from_array(risk_engine.accounts[idx].owner);
            let old_eff = risk_engine.effective_pos_q(idx);
            let old_effective_pos_q =
                i64::try_from(old_eff).map_err(|_| error!(UmmoError::InvalidAmount))?;

            let liquidated = risk_engine
                .liquidate_at_oracle_with_risk_price(
                    liquidatee_engine_idx,
                    now_slot,
                    oracle.price,
                    risk_price,
                )
                .map_err(|err| error!(UmmoError::from(err)))?;

            let mut bounty_paid: u64 = 0;
            if liquidated && old_eff != 0 {
                let abs_q: u128 = old_eff.unsigned_abs();
                let notional = (abs_q * (oracle.price as u128)) / percolator::POS_SCALE;

                let liq_fee = compute_capped_liquidation_fee(
                    notional,
                    risk_engine.params.liquidation_fee_bps,
                    risk_engine.params.min_liquidation_abs.get(),
                    risk_engine.params.liquidation_fee_cap.get(),
                );
                let bounty = compute_bounty_from_liquidation_fee(liq_fee, bounty_share_bps, bounty_cap_abs);

                let ins_bal = risk_engine.insurance_fund.balance.get();
                let vault_bal = risk_engine.vault.get();
                let pay = compute_bounty_payment(bounty, ins_bal, risk_engine.insurance_floor, vault_bal);
                if pay > 0 {
                    risk_engine.insurance_fund.balance = percolator::U128::new(ins_bal - pay);
                    risk_engine.vault = percolator::U128::new(vault_bal - pay);
                    bounty_paid = u64::try_from(pay).map_err(|_| error!(UmmoError::RiskOverflow))?;
                }
            }

            Ok((
                liquidated,
                liquidatee_owner,
                old_effective_pos_q,
                bounty_paid,
            ))
        })?;

    if bounty_paid > 0 {
        let market_key = ctx.accounts.market.key();
        let shard_seed = ctx.accounts.shard.shard_seed;
        let shard_bump = [ctx.accounts.shard.bump];
        let signer_seeds: &[&[u8]] = &[
            SHARD_SEED,
            market_key.as_ref(),
            shard_seed.as_ref(),
            &shard_bump,
        ];
        let shard_info = ctx.accounts.shard.to_account_info();
        spl_token_transfer_signed(
            &ctx.accounts.token_program,
            &ctx.accounts.collateral_mint,
            &ctx.accounts.vault_collateral,
            &ctx.accounts.keeper_collateral,
            &shard_info,
            signer_seeds,
            bounty_paid,
        )?;
    }

    emit!(LiquidationEvent {
        market: ctx.accounts.market.key(),
        shard: ctx.accounts.shard.key(),
        keeper: ctx.accounts.signer.key(),
        liquidatee_owner,
        liquidatee_engine_index: liquidatee_engine_idx,
        liquidated,
        old_effective_pos_q,
        now_slot,
        oracle_price: oracle.price,
        oracle_posted_slot: oracle.posted_slot,
    });

    if bounty_paid > 0 {
        emit!(LiquidationBountyPaid {
            market: ctx.accounts.market.key(),
            shard: ctx.accounts.shard.key(),
            keeper: ctx.accounts.signer.key(),
            liquidatee_engine_index: liquidatee_engine_idx,
            bounty_paid,
            now_slot,
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounty_is_capped_and_never_exceeds_liq_fee() {
        assert_eq!(compute_bounty_from_liquidation_fee(0, 2_000, 50_000_000), 0);
        assert_eq!(compute_bounty_from_liquidation_fee(10_000, 2_000, 50_000_000), 2_000);
        assert_eq!(compute_bounty_from_liquidation_fee(100, 2_000, 50_000_000), 20);

        let liq_fee = 1_000_000_000u128;
        let bounty = compute_bounty_from_liquidation_fee(liq_fee, 2_000, 50_000_000);
        assert!(bounty <= 50_000_000u128);
        assert!(bounty <= liq_fee);
    }

    #[test]
    fn bounty_payment_respects_insurance_floor_and_vault() {
        let bounty = 1_000u128;
        assert_eq!(
            compute_bounty_payment(bounty, 10_000, 9_500, 10_000),
            500
        );
        assert_eq!(
            compute_bounty_payment(bounty, 10_000, 0, 200),
            200
        );
        assert_eq!(
            compute_bounty_payment(bounty, 10_000, 10_000, 10_000),
            0
        );
    }

    #[test]
    fn liquidation_fee_clamps_to_min_and_cap() {
        let fee = compute_capped_liquidation_fee(0, 50, 1_000, 10_000);
        assert_eq!(fee, 1_000);

        let fee = compute_capped_liquidation_fee(10_000_000, 50, 1_000, 10_000);
        assert_eq!(fee, 10_000);
    }
}

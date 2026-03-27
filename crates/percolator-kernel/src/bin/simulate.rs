use percolator::{
    CrankOutcome, RiskEngine, RiskError, RiskParams, U128, MAX_ABS_FUNDING_BPS_PER_SLOT,
    MAX_ORACLE_PRICE, POS_SCALE,
};
use std::collections::BTreeMap;

#[derive(Clone, Debug)]
struct SimConfig {
    seed: u64,
    steps: u64,
    initial_price: u64,
    // Price process (GBM-ish, dt=1 slot)
    mu_per_step: f64,
    sigma_per_step: f64,
    jump_prob: f64,
    jump_sigma: f64,
    // Market microstructure
    spread_bps: u64,
    /// Conservative risk price uplift (bps) applied to oracle for margin checks
    risk_haircut_bps: u64,
    // Population / actions
    num_users: u16,
    user_deposit: u128,
    lp_deposit: u128,
    trades_per_step: u16,
    max_trade_qty_base: u64,
    /// Probability the user trades long (0..=1)
    p_long: f64,
    /// Target utilization of max IM size (0..=1). Higher => more rejections + liqs.
    target_im_util: f64,
    max_revalidations: u16,
    // Param sweep
    paths_per_param: u16,
    /// If set, run only this param index (0-based in sweep list)
    only_param: Option<u64>,
}

#[derive(Clone, Debug, Default)]
struct RunStats {
    ok_ops: u64,
    err_ops: u64,
    err_by_kind: BTreeMap<&'static str, u64>,
    trades_ok: u64,
    trades_rejected: u64,
    deposits_ok: u64,
    withdrawals_ok: u64,
    insurance_topups_ok: u64,
    liquidations: u64,
    gc_closed: u64,
    // End-state snapshots
    final_price: u64,
    final_risk_price: u64,
    final_vault: u128,
    final_insurance: u128,
    final_c_tot: u128,
    final_pnl_pos_tot: u128,
    final_pnl_matured_pos_tot: u128,
    final_oi_long_q: u128,
    final_oi_short_q: u128,
    slack_v_minus_ctot_ins: i128,
}

fn main() {
    let cfg = parse_args_or_exit();
    let params_list = build_param_sweep();

    eprintln!(
        "percolator-sim: params={}, paths/param={}, steps={}, users={}, trades/step={}, only_param={:?}",
        params_list.len(),
        cfg.paths_per_param,
        cfg.steps,
        cfg.num_users,
        cfg.trades_per_step,
        cfg.only_param
    );

    for (p_idx, params) in params_list.into_iter().enumerate() {
        if let Some(only) = cfg.only_param {
            if (p_idx as u64) != only {
                continue;
            }
        }
        let mut agg = Aggregates::default();
        for run in 0..cfg.paths_per_param {
            let mut cfg_run = cfg.clone();
            cfg_run.seed = cfg.seed.wrapping_add((p_idx as u64) * 1_000_000).wrapping_add(run as u64);
            let stats = simulate_one(&cfg_run, params);
            agg.add(&stats);
            print_jsonl_run(p_idx as u64, run as u64, &cfg_run, &params, &stats);
        }
        eprintln!("{}", agg.render_summary_line(p_idx as u64, &params));
    }
}

fn parse_args_or_exit() -> SimConfig {
    let mut cfg = SimConfig {
        seed: 1,
        steps: 2_000,
        initial_price: 1_000_000,
        mu_per_step: 0.0,
        sigma_per_step: 0.003,
        jump_prob: 0.0005,
        jump_sigma: 0.05,
        spread_bps: 5,
        risk_haircut_bps: 0,
        num_users: 20,
        user_deposit: 5_000_000_000,
        lp_deposit: 200_000_000_000,
        trades_per_step: 5,
        max_trade_qty_base: 250,
        p_long: 0.5,
        target_im_util: 0.7,
        max_revalidations: 64,
        paths_per_param: 5,
        only_param: None,
    };

    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--help" || a == "-h") {
        print_help_and_exit();
    }

    for raw in args.into_iter().skip(1) {
        let Some((k, v)) = raw.split_once('=') else {
            eprintln!("bad arg (expected key=value): {raw}");
            std::process::exit(2);
        };
        match k {
            "--seed" => cfg.seed = parse_u64(k, v),
            "--steps" => cfg.steps = parse_u64(k, v),
            "--initial-price" => cfg.initial_price = parse_u64(k, v),
            "--mu" => cfg.mu_per_step = parse_f64(k, v),
            "--sigma" => cfg.sigma_per_step = parse_f64(k, v),
            "--jump-prob" => cfg.jump_prob = parse_f64(k, v),
            "--jump-sigma" => cfg.jump_sigma = parse_f64(k, v),
            "--spread-bps" => cfg.spread_bps = parse_u64(k, v),
            "--risk-haircut-bps" => cfg.risk_haircut_bps = parse_u64(k, v),
            "--users" => cfg.num_users = parse_u16(k, v),
            "--user-deposit" => cfg.user_deposit = parse_u128(k, v),
            "--lp-deposit" => cfg.lp_deposit = parse_u128(k, v),
            "--trades-per-step" => cfg.trades_per_step = parse_u16(k, v),
            "--max-trade-qty" => cfg.max_trade_qty_base = parse_u64(k, v),
            "--p-long" => cfg.p_long = parse_f64(k, v),
            "--target-im-util" => cfg.target_im_util = parse_f64(k, v),
            "--max-revalidations" => cfg.max_revalidations = parse_u16(k, v),
            "--paths-per-param" => cfg.paths_per_param = parse_u16(k, v),
            "--only-param" => cfg.only_param = Some(parse_u64(k, v)),
            _ => {
                eprintln!("unknown arg: {k}");
                print_help_and_exit();
            }
        }
    }

    if cfg.initial_price == 0 || cfg.initial_price > MAX_ORACLE_PRICE {
        eprintln!("--initial-price must be in 1..={MAX_ORACLE_PRICE}");
        std::process::exit(2);
    }
    if !(0.0..=1.0).contains(&cfg.jump_prob) {
        eprintln!("--jump-prob must be in [0,1]");
        std::process::exit(2);
    }
    if !(0.0..=1.0).contains(&cfg.p_long) {
        eprintln!("--p-long must be in [0,1]");
        std::process::exit(2);
    }
    if !(0.0..=1.0).contains(&cfg.target_im_util) {
        eprintln!("--target-im-util must be in [0,1]");
        std::process::exit(2);
    }
    if cfg.risk_haircut_bps > 10_000 {
        eprintln!("--risk-haircut-bps must be <= 10000");
        std::process::exit(2);
    }
    if cfg.num_users == 0 {
        eprintln!("--users must be > 0");
        std::process::exit(2);
    }
    if cfg.paths_per_param == 0 {
        eprintln!("--paths-per-param must be > 0");
        std::process::exit(2);
    }

    cfg
}

fn print_help_and_exit() -> ! {
    eprintln!(
        r#"Usage:
  cargo run --manifest-path crates/percolator-kernel/Cargo.toml --features "host test" --bin simulate -- \
    --steps=2000 --users=20 --trades-per-step=5

Args (key=value):
  --seed=1
  --steps=2000
  --initial-price=1000000
  --mu=0.0                 (per-step drift, in log space)
  --sigma=0.003            (per-step vol, in log space)
  --jump-prob=0.0005
  --jump-sigma=0.05        (log-jump stddev)
  --spread-bps=5
  --risk-haircut-bps=0      (uplift oracle for margin checks)
  --users=20
  --user-deposit=5000000000
  --lp-deposit=200000000000
  --trades-per-step=5
  --max-trade-qty=250       (base units; internally scaled by POS_SCALE)
  --p-long=0.5              (probability user trades long)
  --target-im-util=0.7      (target fraction of max IM size)
  --max-revalidations=64    (keeper crank liquidation budget)
  --paths-per-param=5
  --only-param=12           (optional: run just one param index)

Output:
  - JSONL per-run stats to stdout
  - Summary lines to stderr
"#
    );
    std::process::exit(0);
}

fn build_param_sweep() -> Vec<RiskParams> {
    // Keep this intentionally small to start; expand as you decide what matters most.
    // All values are in bps; other fields follow the engine defaults from tests.
    let mut out = Vec::new();

    let base = RiskParams {
        warmup_period_slots: 100,
        maintenance_margin_bps: 500,
        initial_margin_bps: 1000,
        trading_fee_bps: 10,
        max_accounts: 64,
        new_account_fee: U128::new(1000),
        maintenance_fee_per_slot: U128::new(1),
        max_crank_staleness_slots: 10_000,
        liquidation_fee_bps: 100,
        liquidation_fee_cap: U128::new(1_000_000),
        liquidation_buffer_bps: 50,
        min_liquidation_abs: U128::new(0),
        min_initial_deposit: U128::new(0),
        min_nonzero_mm_req: 1,
        min_nonzero_im_req: 2,
    };

    let mm_bps = [300u64, 500, 800];
    let im_bps = [800u64, 1000, 1500];
    let fee_bps = [0u64, 5, 10, 20];
    let liq_fee_bps = [50u64, 100, 200];

    for &mm in &mm_bps {
        for &im in &im_bps {
            if mm >= im {
                continue;
            }
            for &fee in &fee_bps {
                for &lfee in &liq_fee_bps {
                    let mut p = base;
                    p.maintenance_margin_bps = mm;
                    p.initial_margin_bps = im;
                    p.trading_fee_bps = fee;
                    p.liquidation_fee_bps = lfee;
                    out.push(p);
                }
            }
        }
    }

    out
}

fn simulate_one(cfg: &SimConfig, params: RiskParams) -> RunStats {
    let mut rng = SplitMix64::new(cfg.seed);
    let mut stats = RunStats::default();

    let mut engine = RiskEngine::new(params);
    let mut slot: u64 = 1;
    let mut price = cfg.initial_price;
    let mut risk_price = uplift_price_bps(price, cfg.risk_haircut_bps);
    engine.current_slot = slot;

    let lp_idx = must_ok("add_lp", engine.add_lp([1u8; 32], [2u8; 32], params.new_account_fee.get() + 1_000_000));
    let _ = solana_atomic(&mut engine, &mut stats, |e| e.deposit(lp_idx, cfg.lp_deposit, price, slot));

    let mut user_indices = Vec::with_capacity(cfg.num_users as usize);
    for _ in 0..cfg.num_users {
        let u = must_ok("add_user", engine.add_user(params.new_account_fee.get() + 1_000_000));
        user_indices.push(u);
        let _ = solana_atomic(&mut engine, &mut stats, |e| e.deposit(u, cfg.user_deposit, price, slot));
    }

    // Initial crank to establish last_crank_slot + accrue base state.
    {
        let candidates = all_candidates(lp_idx, &user_indices);
        if let Ok(out) = solana_atomic(&mut engine, &mut stats, |e| {
            e.keeper_crank_with_risk_price(slot, price, risk_price, &candidates, cfg.max_revalidations)
        }) {
            absorb_crank_outcome(&mut stats, out);
        }
    }

    for _ in 0..cfg.steps {
        slot = slot.saturating_add(1);
        price = next_price(cfg, &mut rng, price);
        risk_price = uplift_price_bps(price, cfg.risk_haircut_bps);
        let funding_rate = next_funding_rate_bps(cfg, &mut rng, price);
        engine.set_funding_rate_for_next_interval(funding_rate);

        // Crank first: this is the on-chain "heartbeat" that advances funding and applies liquidations.
        {
            let candidates = all_candidates(lp_idx, &user_indices);
            if let Ok(out) = solana_atomic(&mut engine, &mut stats, |e| {
                e.keeper_crank_with_risk_price(slot, price, risk_price, &candidates, cfg.max_revalidations)
            }) {
                absorb_crank_outcome(&mut stats, out);
            }
        }

        // Random cashflows (deposit/withdraw/top-up) to exercise more instructions.
        // We keep these probabilities low to avoid dominating the run.
        if rng.next_f64() < 0.03 {
            let user = user_indices[rng.next_usize(user_indices.len())];
            let amount = (cfg.user_deposit / 10).max(1);
            if solana_atomic(&mut engine, &mut stats, |e| e.deposit(user, amount, price, slot)).is_ok() {
                stats.deposits_ok += 1;
            }
        }
        if rng.next_f64() < 0.03 {
            let user = user_indices[rng.next_usize(user_indices.len())];
            let cap = engine.accounts[user as usize].capital.get();
            let amount = cap / 10;
            if amount > 0
                && solana_atomic(&mut engine, &mut stats, |e| {
                    e.withdraw_with_risk_price(user, amount, price, risk_price, slot)
                })
                .is_ok()
            {
                stats.withdrawals_ok += 1;
            }
        }
        if rng.next_f64() < 0.002 {
            let amount = (cfg.user_deposit / 20).max(1);
            if solana_atomic(&mut engine, &mut stats, |e| e.top_up_insurance_fund(amount)).is_ok() {
                stats.insurance_topups_ok += 1;
            }
        }

        for _ in 0..cfg.trades_per_step {
            let user = user_indices[rng.next_usize(user_indices.len())];
            let is_user_long = rng.next_f64() < cfg.p_long;
            let Some(size_q) = propose_feasible_trade_size_q(
                cfg,
                &engine,
                user,
                risk_price,
                is_user_long,
                &mut rng,
            ) else {
                stats.trades_rejected += 1;
                continue;
            };

            let exec_price = apply_spread(price, cfg.spread_bps, is_user_long);

            let res = solana_atomic(&mut engine, &mut stats, |e| {
                e.execute_trade_with_risk_price(user, lp_idx, price, risk_price, slot, size_q, exec_price)
            });
            match res {
                Ok(()) => stats.trades_ok += 1,
                Err(_) => stats.trades_rejected += 1,
            }
        }
    }

    stats.final_price = price;
    stats.final_risk_price = risk_price;
    stats.final_vault = engine.vault.get();
    stats.final_insurance = engine.insurance_fund.balance.get();
    stats.final_c_tot = engine.c_tot.get();
    stats.final_pnl_pos_tot = engine.pnl_pos_tot;
    stats.final_pnl_matured_pos_tot = engine.pnl_matured_pos_tot;
    stats.final_oi_long_q = engine.oi_eff_long_q;
    stats.final_oi_short_q = engine.oi_eff_short_q;
    let slack = (engine.vault.get() as i128)
        - (engine.c_tot.get() as i128)
        - (engine.insurance_fund.balance.get() as i128);
    stats.slack_v_minus_ctot_ins = slack;
    stats
}

fn absorb_crank_outcome(stats: &mut RunStats, out: CrankOutcome) {
    stats.liquidations = stats.liquidations.saturating_add(out.num_liquidations as u64);
    stats.gc_closed = stats.gc_closed.saturating_add(out.num_gc_closed as u64);
}

fn solana_atomic<T, F>(engine: &mut RiskEngine, stats: &mut RunStats, f: F) -> percolator::Result<T>
where
    F: FnOnce(&mut RiskEngine) -> percolator::Result<T>,
{
    let snapshot = engine.clone();
    match f(engine) {
        Ok(v) => {
            stats.ok_ops += 1;
            Ok(v)
        }
        Err(e) => {
            *engine = snapshot;
            stats.err_ops += 1;
            *stats.err_by_kind.entry(err_name(e)).or_insert(0) += 1;
            Err(e)
        }
    }
}

fn err_name(e: RiskError) -> &'static str {
    match e {
        RiskError::InsufficientBalance => "InsufficientBalance",
        RiskError::Undercollateralized => "Undercollateralized",
        RiskError::Unauthorized => "Unauthorized",
        RiskError::InvalidMatchingEngine => "InvalidMatchingEngine",
        RiskError::PnlNotWarmedUp => "PnlNotWarmedUp",
        RiskError::Overflow => "Overflow",
        RiskError::AccountNotFound => "AccountNotFound",
        RiskError::NotAnLPAccount => "NotAnLPAccount",
        RiskError::PositionSizeMismatch => "PositionSizeMismatch",
        RiskError::AccountKindMismatch => "AccountKindMismatch",
        RiskError::SideBlocked => "SideBlocked",
        RiskError::CorruptState => "CorruptState",
    }
}

fn must_ok<T>(label: &str, r: percolator::Result<T>) -> T {
    match r {
        Ok(v) => v,
        Err(e) => {
            eprintln!("fatal during {label}: {e:?}");
            std::process::exit(1);
        }
    }
}

fn all_candidates(lp: u16, users: &[u16]) -> Vec<u16> {
    let mut c = Vec::with_capacity(1 + users.len());
    c.push(lp);
    c.extend_from_slice(users);
    c
}

fn apply_spread(oracle: u64, spread_bps: u64, is_buy: bool) -> u64 {
    if spread_bps == 0 {
        return oracle.max(1).min(MAX_ORACLE_PRICE);
    }
    let oracle_u = oracle as u128;
    let spread = spread_bps as u128;
    let px_u = if is_buy {
        oracle_u.saturating_mul(10_000u128 + spread) / 10_000u128
    } else {
        oracle_u.saturating_mul(10_000u128 - spread.min(10_000)) / 10_000u128
    };
    (px_u.min(MAX_ORACLE_PRICE as u128).max(1)) as u64
}

fn next_price(cfg: &SimConfig, rng: &mut SplitMix64, prev: u64) -> u64 {
    let prev_f = prev as f64;
    let z = rng.next_standard_normal();
    let mut log_ret = (cfg.mu_per_step - 0.5 * cfg.sigma_per_step * cfg.sigma_per_step)
        + cfg.sigma_per_step * z;

    if rng.next_f64() < cfg.jump_prob {
        log_ret += cfg.jump_sigma * rng.next_standard_normal();
    }

    let next = prev_f * log_ret.exp();
    if !next.is_finite() {
        return 1;
    }
    let px = next.round().clamp(1.0, MAX_ORACLE_PRICE as f64) as u64;
    px.max(1)
}

fn next_funding_rate_bps(_cfg: &SimConfig, rng: &mut SplitMix64, _price: u64) -> i64 {
    // Simple synthetic funding: mean 0, occasional bursts.
    // The engine clamps this anyway, but we keep it tame for readability.
    let base = (rng.next_standard_normal() * 3.0).round() as i64; // ~N(0,3)
    let burst = if rng.next_f64() < 0.01 {
        (rng.next_standard_normal() * 50.0).round() as i64
    } else {
        0
    };
    let raw = base.saturating_add(burst);
    raw.clamp(-MAX_ABS_FUNDING_BPS_PER_SLOT, MAX_ABS_FUNDING_BPS_PER_SLOT)
}

fn print_jsonl_run(param_idx: u64, run_idx: u64, cfg: &SimConfig, p: &RiskParams, s: &RunStats) {
    // Minimal JSONL (no external deps).
    let e_uc = *s.err_by_kind.get("Undercollateralized").unwrap_or(&0);
    let e_sb = *s.err_by_kind.get("SideBlocked").unwrap_or(&0);
    let e_unauth = *s.err_by_kind.get("Unauthorized").unwrap_or(&0);
    let e_over = *s.err_by_kind.get("Overflow").unwrap_or(&0);
    let e_ib = *s.err_by_kind.get("InsufficientBalance").unwrap_or(&0);
    let e_pnw = *s.err_by_kind.get("PnlNotWarmedUp").unwrap_or(&0);

    print!(
        "{{\"param\":{param_idx},\"run\":{run_idx},\"mm\":{},\"im\":{},\"fee\":{},\"liq_fee\":{},\"steps\":{},\"users\":{},\"trades_ok\":{},\"trades_rejected\":{},\"deposits_ok\":{},\"withdrawals_ok\":{},\"insurance_topups_ok\":{},\"liq\":{},\"gc\":{},\"ok_ops\":{},\"err_ops\":{},\"err_uc\":{},\"err_side_blocked\":{},\"err_unauthorized\":{},\"err_overflow\":{},\"err_insufficient_balance\":{},\"err_pnl_not_warmed\":{},\"final_price\":{},\"risk_price\":{},\"vault\":{},\"insurance\":{},\"c_tot\":{},\"pnl_pos_tot\":{},\"pnl_matured_pos_tot\":{},\"oi_long_q\":{},\"oi_short_q\":{},\"slack\":{}}}\n",
        p.maintenance_margin_bps,
        p.initial_margin_bps,
        p.trading_fee_bps,
        p.liquidation_fee_bps,
        cfg.steps,
        cfg.num_users,
        s.trades_ok,
        s.trades_rejected,
        s.deposits_ok,
        s.withdrawals_ok,
        s.insurance_topups_ok,
        s.liquidations,
        s.gc_closed,
        s.ok_ops,
        s.err_ops,
        e_uc,
        e_sb,
        e_unauth,
        e_over,
        e_ib,
        e_pnw,
        s.final_price,
        s.final_risk_price,
        s.final_vault,
        s.final_insurance,
        s.final_c_tot,
        s.final_pnl_pos_tot,
        s.final_pnl_matured_pos_tot,
        s.final_oi_long_q,
        s.final_oi_short_q,
        s.slack_v_minus_ctot_ins
    );
}

#[derive(Default)]
struct Aggregates {
    runs: u64,
    trades_ok_sum: u64,
    trades_rej_sum: u64,
    liq_sum: u64,
    vault_sum: u128,
    insurance_sum: u128,
    slack_min: i128,
    slack_max: i128,
}

impl Aggregates {
    fn add(&mut self, s: &RunStats) {
        self.runs += 1;
        self.trades_ok_sum += s.trades_ok;
        self.trades_rej_sum += s.trades_rejected;
        self.liq_sum += s.liquidations;
        self.vault_sum += s.final_vault;
        self.insurance_sum += s.final_insurance;
        if self.runs == 1 {
            self.slack_min = s.slack_v_minus_ctot_ins;
            self.slack_max = s.slack_v_minus_ctot_ins;
        } else {
            self.slack_min = self.slack_min.min(s.slack_v_minus_ctot_ins);
            self.slack_max = self.slack_max.max(s.slack_v_minus_ctot_ins);
        }
    }

    fn render_summary_line(&self, param_idx: u64, p: &RiskParams) -> String {
        let runs = self.runs.max(1) as u128;
        let avg_vault = self.vault_sum / runs;
        let avg_ins = self.insurance_sum / runs;
        format!(
            "param={param_idx} mm={} im={} fee={} liq_fee={} | avg(trades_ok)={} avg(trades_rej)={} avg(liq)={} avg(vault)={} avg(ins)={} slack[min,max]=[{},{}]",
            p.maintenance_margin_bps,
            p.initial_margin_bps,
            p.trading_fee_bps,
            p.liquidation_fee_bps,
            (self.trades_ok_sum as u128 / runs) as u64,
            (self.trades_rej_sum as u128 / runs) as u64,
            (self.liq_sum as u128 / runs) as u64,
            avg_vault,
            avg_ins,
            self.slack_min,
            self.slack_max
        )
    }
}

fn parse_u64(k: &str, v: &str) -> u64 {
    v.parse::<u64>().unwrap_or_else(|_| {
        eprintln!("bad value for {k}: {v}");
        std::process::exit(2);
    })
}
fn parse_u16(k: &str, v: &str) -> u16 {
    v.parse::<u16>().unwrap_or_else(|_| {
        eprintln!("bad value for {k}: {v}");
        std::process::exit(2);
    })
}
fn parse_u128(k: &str, v: &str) -> u128 {
    v.parse::<u128>().unwrap_or_else(|_| {
        eprintln!("bad value for {k}: {v}");
        std::process::exit(2);
    })
}
fn parse_f64(k: &str, v: &str) -> f64 {
    v.parse::<f64>().unwrap_or_else(|_| {
        eprintln!("bad value for {k}: {v}");
        std::process::exit(2);
    })
}

fn uplift_price_bps(price: u64, bps: u64) -> u64 {
    if bps == 0 {
        return price;
    }
    let p = price as u128;
    let uplifted = p.saturating_mul(10_000u128 + (bps as u128)) / 10_000u128;
    (uplifted.min(MAX_ORACLE_PRICE as u128).max(1)) as u64
}

fn propose_feasible_trade_size_q(
    cfg: &SimConfig,
    engine: &RiskEngine,
    user: u16,
    risk_price: u64,
    is_user_long: bool,
    rng: &mut SplitMix64,
) -> Option<i128> {
    let u = user as usize;
    if !engine.is_used(u) {
        return None;
    }

    // Estimate max absolute effective position allowed by IM.
    let max_abs_eff_q = max_abs_eff_q_by_im(engine, u, risk_price)?;
    if max_abs_eff_q == 0 {
        return None;
    }

    // Choose a target position as a fraction of max.
    // Slightly bias toward smaller targets for stability.
    let u01 = rng.next_f64();
    let frac = (cfg.target_im_util * (u01 * u01).sqrt()).clamp(0.0, 1.0);
    let target_abs = ((max_abs_eff_q as f64) * frac).round() as u128;

    let cur_eff = engine.effective_pos_q(u);
    let target_eff = if is_user_long {
        u128_to_i128(target_abs)?
    } else {
        -u128_to_i128(target_abs)?
    };

    let mut delta = target_eff.checked_sub(cur_eff)?;
    if delta == 0 {
        return None;
    }

    // Cap per-step trade size.
    let cap_abs = (cfg.max_trade_qty_base as u128).saturating_mul(POS_SCALE);
    if cap_abs > 0 {
        let d_abs = delta.unsigned_abs();
        if d_abs > cap_abs {
            delta = if delta > 0 {
                u128_to_i128(cap_abs)?
            } else {
                -u128_to_i128(cap_abs)?
            };
        }
    }

    if delta == i128::MIN {
        return None;
    }
    Some(delta)
}

fn max_abs_eff_q_by_im(engine: &RiskEngine, idx: usize, risk_price: u64) -> Option<u128> {
    if risk_price == 0 {
        return None;
    }
    let acc = &engine.accounts[idx];
    let eq_raw = engine.account_equity_init_raw(acc, idx);
    if eq_raw <= 0 {
        return Some(0);
    }

    let im_bps = engine.params.initial_margin_bps as u128;
    if im_bps == 0 {
        // Degenerate: IM disabled. Still bound by global limits.
        return Some(percolator::MAX_POSITION_ABS_Q.min(u128::MAX));
    }

    let eq_u = eq_raw as u128;
    let max_notional = eq_u.saturating_mul(10_000u128) / im_bps;
    let max_abs_eff = max_notional.saturating_mul(POS_SCALE) / (risk_price as u128);
    Some(max_abs_eff.min(percolator::MAX_POSITION_ABS_Q))
}

fn u128_to_i128(x: u128) -> Option<i128> {
    if x > i128::MAX as u128 {
        None
    } else {
        Some(x as i128)
    }
}

// ============================================================================
// Minimal deterministic RNG (no external deps)
// ============================================================================

#[derive(Clone, Debug)]
struct SplitMix64 {
    state: u64,
    spare_normal: Option<f64>,
}

impl SplitMix64 {
    fn new(seed: u64) -> Self {
        Self {
            state: seed,
            spare_normal: None,
        }
    }

    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9e3779b97f4a7c15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
        z ^ (z >> 31)
    }

    fn next_usize(&mut self, n: usize) -> usize {
        if n == 0 {
            return 0;
        }
        (self.next_u64() % (n as u64)) as usize
    }

    fn next_f64(&mut self) -> f64 {
        // Uniform in [0,1).
        let x = self.next_u64() >> 11; // 53 bits
        (x as f64) * (1.0 / ((1u64 << 53) as f64))
    }

    fn next_standard_normal(&mut self) -> f64 {
        // Box-Muller, caching one spare sample.
        if let Some(z1) = self.spare_normal.take() {
            return z1;
        }
        let mut u1 = self.next_f64();
        let u2 = self.next_f64();
        if u1 < 1e-12 {
            u1 = 1e-12;
        }
        let r = (-2.0 * u1.ln()).sqrt();
        let theta = 2.0 * std::f64::consts::PI * u2;
        let z0 = r * theta.cos();
        let z1 = r * theta.sin();
        self.spare_normal = Some(z1);
        z0
    }
}

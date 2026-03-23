# Runbook: keeper cadence tuning

## Key constants (v0)

- **Hard stale threshold**: 150 slots (≈60s @ ~400ms/slot)
- **Crank backstop**: the web client may prepend a crank before trade/withdraw/liquidation when stale.

## Recommended cadence

- **Cron interval**: 10–20 seconds.
- **Max revalidations** (`maxRevalidations`): start at 32–64.
- **Candidate lists**: keep ordered candidate lists small and biased toward “most likely unhealthy” accounts; the kernel revalidates safety.

## What to monitor

Use `"/admin/ops"`:

- **Staleness**: watch `stalenessSlots` per shard. If consistently >150, increase keeper frequency or investigate RPC issues.
- **Liquidations (24h)**: spikes can indicate oracle issues, price crashes, or insufficient keeper coverage.
- **Trades (24h)**: unexpected drops can indicate matcher signing failures or chronic staleness gating.
- **Matcher errors**: confirm signing failures line up with expected operational changes (deploys, rotations).

## Common failure modes

- **RPC degraded**: `getSlot` or `getTransaction` timeouts → staleness rises → user actions fail.
- **Oracle stale**: Pyth updates not landing → crank/trade/withdraw/liquidation can reject.
- **Candidate list too large**: crank spends budget scanning; keep lists smaller and tune `maxRevalidations`.


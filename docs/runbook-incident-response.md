# Runbook: incident response (v0)

This is a pragmatic checklist for the most likely v0 incidents: **staleness**, **oracle failures**, **matcher failures**, and **liquidation spikes**.

## 1) Users report “stale” / actions failing

- Check `"/admin/ops"`:
  - Is `stalenessSlots` > 150 for affected shards?
- If stale:
  - Run a manual crank from the market page.
  - If staleness persists, investigate RPC health (`getSlot`, `getTransaction` latency).

## 2) Quotes failing / trades not co-signing

- Check `"/admin/ops" → Matcher errors`.
- Common causes:
  - `MATCHER_KEYPAIR_JSON` missing/malformed.
  - Market matcher authority rotated but backend key was not updated (signer mismatch).
  - RPC outages affecting oracle reads (`getAccountInfo`, `getSlot`).

## 3) Oracle stale / confidence too wide

- Symptoms:
  - Quote action errors (“Oracle is stale…”, “confidence too wide”)
  - On-chain rejections for trade/withdraw/liquidation.
- Actions:
  - Verify the oracle feed account is correct for the market.
  - Validate Pyth receiver updates are posting (external monitoring if available).
  - If persistent, consider pausing trading (see `docs/runbook-trading-pause.md`).

## 4) Liquidation spikes

- Check `"/admin/ops"` liquidation counts and shard staleness.
- Mitigations:
  - Ensure keepers are running frequently.
  - If matcher continues quoting into stale markets, tighten staleness checks in matcher service.
  - Pause trading if needed.

## Recovery

- Once stable:
  - Confirm cranks are advancing normally.
  - Confirm matcher errors have stopped.
  - Execute a small end-to-end trade and a small withdrawal on a fresh shard.


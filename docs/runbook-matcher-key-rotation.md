# Runbook: matcher key rotation

This protocol uses a **single matcher authority** (v0). Trades require a matcher co-signature, and the on-chain program enforces that the matcher signer equals the configured `MarketConfig.matcher_authority`.

## Goal

Rotate the matcher keypair without breaking end-user flows longer than necessary.

## Prereqs

- You can sign transactions as the **market authority**.
- You have access to update Convex environment variables for `@ummo/backend`.
- The web app is configured with `NEXT_PUBLIC_CONVEX_URL`.

## Procedure

### 1) Generate a new matcher keypair

- Generate a new ed25519 keypair (64 bytes: secret(32) + public(32)).
- Record:
  - **New pubkey** (base58)
  - **New secret** (the 64-byte JSON array)

### 2) Update backend matcher secret

- Set `MATCHER_KEYPAIR_JSON` to the new 64-byte JSON array.
- Restart / redeploy the Convex backend so the matcher action can sign with the new key.

### 3) Update on-chain market config

Use the market page admin control:

- Open the market page (`/markets/[market]`) as the **market authority** wallet.
- In **Admin → Rotate matcher authority**, paste the **new matcher pubkey** and click **Rotate**.
- The UI sends the on-chain `set_matcher_authority` instruction and indexes the resulting event.

### 4) Verify

- Confirm Convex `markets.matcherAuthority` equals the new pubkey.
- Visit `"/admin/ops"` and ensure there are **no new matcher errors** for `signTransactions`.
- Request a quote + execute a small trade. It should succeed with the new matcher.

## Rollback

If anything fails:

- Revert `MATCHER_KEYPAIR_JSON` to the previous value.
- Rotate the on-chain matcher authority back to the previous pubkey using the same admin control.


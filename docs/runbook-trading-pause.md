# Runbook: pause / unpause trading (v0)

v0 “pause” is implemented operationally by controlling the **matcher co-sign** requirement:

- Trades cannot execute without a valid matcher signature.
- Deposits/withdrawals remain available (this is intentional for user safety).

## Pause trading (fast path)

Choose one:

### Option A) Stop matcher signing

- Take the matcher service offline (or make it return errors).
- Result: `execute_trade` transactions will fail because the matcher signature is missing/invalid.

### Option B) Rotate matcher authority to an emergency key you do not run

- Rotate on-chain matcher authority to a pubkey that you do not have a signing service for.
- Result: all trades fail authorization deterministically.

This can be performed using the market page admin control (`/markets/[market] → Admin → Rotate matcher authority`).

## Unpause trading

- Restore matcher service (Option A), and/or
- Rotate the on-chain matcher authority back to the active matcher pubkey (Option B).

## Verify

- Check `"/admin/ops"` for matcher errors:
  - During pause: you should see expected failures for trade signing.
  - After unpause: errors should stop.

## Notes

- If you need to pause **withdrawals** or **deposits**, that requires a program-level pause mechanism (out of scope for v0).


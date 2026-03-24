# ummo

Monorepo (Turborepo + Bun) for a swap-like isolated perps platform:

- `apps/web`: Next.js 16.2 frontend
- `packages/backend`: Convex backend (index/cache + APIs)
- `apps/chain`: Quasar program (on-chain settlement)
- `crates/percolator-kernel`: vendored Percolator risk engine kernel

## Prereqs

- Bun
- (Optional for on-chain) Rust + Solana CLI + Quasar CLI (`cargo install quasar-cli`)

## Install

```bash
cd ummo
bun install
```

## Dev

Runs the web app + Convex together:

```bash
bun run dev
```

Notes:
- Convex will prompt you to create/link a deployment on first run.
- Create `apps/web/.env.local` from `apps/web/.env.local.example`.

## Bootstrap a market (devnet)

The `/markets` page is **Convex-indexed**. You won’t see anything until you initialize a market on-chain and then index the transaction into Convex.

Prereqs:

- **Dev server running**: `bun run dev`
- **Web env set**: `apps/web/.env.local` contains `NEXT_PUBLIC_CONVEX_URL=...`
- **Oracle feed**: a real Pyth receiver `PriceUpdateV2` account on devnet (owner must be `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ`)
- **Matcher authority**: the pubkey that corresponds to backend `MATCHER_KEYPAIR_JSON` (this is what co-signs trades)

Run:

```bash
bun run init-market \
  --rpc "https://api.devnet.solana.com" \
  --convex "$NEXT_PUBLIC_CONVEX_URL" \
  --payer "$HOME/.config/solana/id.json" \
  --oracle-feed "<PriceUpdateV2_account_pubkey>" \
  --collateral-mint "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" \
  --matcher-authority "<matcher_pubkey>" \
  --market-id 0 \
  --shard-id 0
```

After it prints success, refresh `/markets` (or visit the printed `/markets/<market>` URL).

## Build

```bash
bun run build
```

## Typecheck / Lint

```bash
bun run typecheck
bun run lint
```

## Chain (Quasar)

```bash
cd apps/chain
quasar build
```

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

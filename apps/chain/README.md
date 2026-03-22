# `@ummo/chain` (Quasar)

This directory contains the on-chain `ummo_market` Solana program, built with **Quasar**.

## Prereqs

- Rust
- Solana CLI
- Quasar CLI

```bash
cargo install quasar-cli
```

## Build / IDL

```bash
quasar build
quasar idl .
```

Outputs:

- `target/deploy/ummo_market.so`
- `target/idl/ummo_market.idl.json`
- `target/client/typescript/ummo_market/` (web3 v2 + kit clients)

## Notes

- Quasar project config lives in `Quasar.toml`.
- Legacy Anchor scaffold (`Anchor.toml`, `migrations/`, `tests/`, `programs/ummo_market/`) is kept temporarily for reference while we port the program surface area.


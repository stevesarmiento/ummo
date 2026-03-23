## PRD: SOL Perps v0 (Quasar + Percolator + Convex + Solana Kit)

## Problem Statement

We want to build a **swap-like isolated-margin perpetuals** product on Solana where:

- **Settlement and all authoritative state transitions are on-chain**, so correctness does not depend on an off-chain database.
- **User experience is fast**, with the majority of reads served by an off-chain index/cache layer.
- **Risk and accounting are deterministic and auditable**, using the vendored **Percolator** kernel as the canonical risk/settlement engine.
- The system is designed to **scale and evolve** (more markets, more LPs, more keepers) without repeated architecture resets.

Today the repo scaffolds the monorepo, a Quasar-based chain crate, and the Percolator kernel, but the product surface area is missing: complete on-chain accounts + vault flows, oracle validation, trade execution wiring, keepers, indexing, a typed SDK, and a web UX that feels reliable and “not stale”.

## Solution

Build a production-oriented baseline with clear trust boundaries:

- **On-chain program (Quasar)** provides:
  - Permissioned market creation/configuration
  - USDC collateral custody (vaults)
  - A Percolator-backed **risk engine per market shard**
  - A per-user PDA mapping that binds a wallet to a risk-engine account index
  - Core state transitions: open account, deposit, withdraw, execute trade (user ↔ house LP), keeper crank, liquidation
  - Events for all critical transitions, enabling deterministic off-chain indexing

- **Off-chain services** provide:
  - A **matcher** that quotes prices and **co-signs trade transactions** (single matcher authority for v0)
  - A **keeper loop** (cron-operated initially) that keeps markets fresh, while preserving permissionless keeper endpoints as a liveness backstop

- **Convex read model** provides:
  - Indexed views (markets, traders, balances, positions, health, trades, liquidations, crank freshness)
  - Query APIs consumed by the web app and operational tooling

- **Web app (Next.js)** provides:
  - Wallet connection via **Wallet Standard**
  - Deposit/withdraw flows
  - Quote + trade (IOC)
  - Position + health views (Convex-first reads)

### Locked decisions

- **Counterparty model**: user trades against a protocol “house” LP account (v0).
- **Quote authorization**: matcher co-signs the trade transaction (no ed25519-verified quote envelopes in v0).
- **Oracle**: Pyth for v0 with explicit staleness + confidence policy.
- **Market creation**: permissioned.
- **Read model**: Convex-first.
- **Freshness**: “hard stale” threshold ~60s; keepers run frequently; client/matcher can prepend crank when needed.
- **Collateral/market**: USDC collateral; initial market is SOL perps.
- **Client stack**: use `@solana/kit` + `@solana/connector` where possible; avoid `@solana/web3.js` unless unavoidable.
- **Scalability posture**: design for multi-market + sharding now (additive growth), even if launch starts with one market + one shard.

## User Stories

1. As a **trader**, I want to connect my wallet, so that I can use the protocol without creating a centralized account.
2. As a **trader**, I want the app to remember my previously selected wallet (auto-connect), so that returning is quick.
3. As a **trader**, I want to see supported wallets and select one, so that I can use my preferred wallet.
4. As a **trader**, I want to see available markets, so that I can choose what to trade.
5. As a **trader**, I want to open a margin account for a market, so that I can deposit collateral and trade.
6. As a **trader**, I want my margin account to be bound to my wallet address, so that nobody else can act on it.
7. As a **trader**, I want to see my margin account address and engine index, so that I can debug and verify state.
8. As a **trader**, I want to deposit USDC into my margin account, so that I can collateralize positions.
9. As a **trader**, I want deposits to be rejected if below the protocol minimum, so that accounts don’t get stuck in dust states.
10. As a **trader**, I want to see deposit confirmation progress, so that I know when funds are usable.
11. As a **trader**, I want to see my available collateral and reserved values, so that I understand what I can withdraw.
12. As a **trader**, I want to request a trade quote for direction/size, so that I can see execution price before trading.
13. As a **trader**, I want quotes to be **IOC**, so that I know the fill is all-or-nothing.
14. As a **trader**, I want quotes to expire quickly, so that execution price cannot be replayed long after it was offered.
15. As a **trader**, I want to execute a trade only when the matcher approves it, so that execution price can’t be spoofed.
16. As a **trader**, I want the program to reject trades without matcher authorization, so that bypass is impossible.
17. As a **trader**, I want the program to reject trades that violate risk checks, so that insolvency doesn’t propagate.
18. As a **trader**, I want the program to reject trades using invalid oracle data, so that prices can’t be faked.
19. As a **trader**, I want to see my position, so that I know my exposure.
20. As a **trader**, I want to see my maintenance and initial margin health, so that I can avoid liquidation.
21. As a **trader**, I want to see a “market freshness” indicator, so that I can understand whether my actions might fail.
22. As a **trader**, I want the app to attempt a crank step before trade/withdraw when stale, so that I don’t hit confusing failures.
23. As a **trader**, I want to withdraw USDC when eligible, so that I can exit.
24. As a **trader**, I want withdrawals to be rejected if they would leave me under initial margin with an open position, so that I can’t self-bankrupt.
25. As a **trader**, I want withdrawals to have a dust guard (either 0 or above minimum), so that accounts remain usable or reclaimable.
26. As a **trader**, I want to close my position to flat, so that I can exit risk.
27. As a **trader**, I want closing to flat to be possible when allowed by engine rules even if profit is warming up, so that I’m not trapped.
28. As a **trader**, I want consistent errors that tell me what to do next (e.g., “crank stale”), so that I can recover quickly.
29. As a **trader**, I want every instruction to be atomic, so that partial state changes never occur.
30. As a **trader**, I want liquidation to be deterministic and auditable, so that I can trust outcomes.
31. As a **trader**, I want liquidations to execute at oracle mark with explicit fees, so that there’s no hidden slippage.
32. As a **trader**, I want to see liquidation events and reason codes, so that I understand what happened.
33. As a **trader**, I want a history of my trades, deposits, and withdrawals, so that I can audit my activity.
34. As a **trader**, I want my UI state to load quickly from Convex, so that the product feels web2-fast.
35. As a **trader**, I want the UI to be resilient to RPC flakiness, so that reads don’t block interaction.

36. As a **protocol operator**, I want to permissionlessly allow keepers to crank, so that liveness does not depend on my servers.
37. As a **protocol operator**, I want to run keepers via cron initially, so that operations are simple while iterating.
38. As a **protocol operator**, I want to set a stale threshold (~60s), so that safety gates are enforceable.
39. As a **protocol operator**, I want to create a market with configured risk parameters, so that markets are safe by construction.
40. As a **protocol operator**, I want to configure the oracle feed and validation policy, so that prices are trustworthy.
41. As a **protocol operator**, I want to configure the matcher authority, so that only the approved matcher can authorize trades.
42. As a **protocol operator**, I want to rotate the matcher authority, so that I can recover from key compromise.
43. As a **protocol operator**, I want to pause trading or specific actions in emergencies, so that I can limit damage.
44. As a **protocol operator**, I want to fund the house LP account with initial liquidity, so that users can trade immediately.
45. As a **protocol operator**, I want to add new markets over time, so that the protocol can expand beyond SOL.
46. As a **protocol operator**, I want market sharding to be possible without breaking user accounts, so that scaling is additive.
47. As a **protocol operator**, I want clear observability into crank freshness and liquidation progress, so that I can monitor system health.

48. As a **keeper operator**, I want to crank markets frequently, so that users don’t experience staleness.
49. As a **keeper operator**, I want crank endpoints to be permissionless, so that I can run without allowlisting.
50. As a **keeper operator**, I want to submit liquidation candidates in batches, so that I can make progress efficiently.
51. As a **keeper operator**, I want revalidation behavior that makes old/adversarial candidate lists safe, so that ordering attacks don’t break safety.
52. As a **keeper operator**, I want metrics about crank outcomes, so that I can tune cadence and budgets.

53. As a **matcher operator**, I want to quote and co-sign trades, so that execution is controlled and predictable.
54. As a **matcher operator**, I want the program to reject non-co-signed trades, so that users cannot bypass execution policy.
55. As a **matcher operator**, I want to ensure the market is fresh before quoting, so that trades don’t fail on-chain.
56. As a **matcher operator**, I want the system to support moving from one matcher key to an allowlist later, so that decentralization is possible.

57. As a **developer**, I want a typed SDK built around `@solana/kit`, so that building and sending transactions is consistent.
58. As a **developer**, I want wallet integration built around `@solana/connector`, so that Wallet Standard wallets work by default.
59. As a **developer**, I want typed account/event decoding, so that UI/keepers don’t manually parse bytes.
60. As a **developer**, I want deterministic IDL-driven clients from Quasar, so that chain + SDK stay in sync.
61. As a **developer**, I want integration tests that simulate real flows, so that regressions are caught early.

## Implementation Decisions

- **On-chain architecture**
  - Use **Quasar** for the Solana program framework (zero-copy, `no_std`).
  - Use a **permissioned Market configuration** as the canonical source for:
    - collateral mint
    - oracle feed + validation thresholds
    - matcher authority (single key for v0)
    - risk params for Percolator
    - keeper staleness threshold configuration
  - Use **market sharding** from day 1: a Market can reference one or more independent **Engine Shards** (each with its own vaults + Percolator engine state). New users are assigned to a shard.
  - Maintain a per-user **Trader mapping PDA** containing `{ owner, market/shard reference, engine account index }`.
  - Maintain a dedicated **house LP account** per shard as the default counterparty for user trades.
  - Emit events for deposit/withdraw/trade/crank/liquidation and for config changes (oracle, matcher, params).

- **Percolator integration**
  - Treat the vendored kernel as the **single source of truth** for risk and accounting.
  - Define a stable engine-state representation that is safe under Solana account data alignment constraints (no undefined behavior from misaligned loads).
  - Map kernel errors into program errors with clear, actionable client semantics.

- **Execution / quotes**
  - Require a **matcher signer** in trade instructions and validate against configured matcher authority.
  - Quotes are **IOC** in v0.
  - Preserve an upgrade path: single matcher key → allowlist without breaking the instruction surface.

- **Oracle**
  - Integrate **Pyth** as the v0 oracle.
  - Explicitly define validation policy: max staleness, confidence thresholds, and acceptable price bounds.

- **Vaults & tokens**
  - Use USDC collateral. (Mint addresses are cluster-specific and must be explicitly configured per Market.)
  - Use SPL token vault custody patterns for deposits/withdrawals and protocol-controlled funds (including house LP funding).

- **Keepers**
  - Keep `keeper_crank` and liquidation progress endpoints **permissionless**.
  - Run cron-based keepers initially to maintain freshness.
  - Gate sensitive operations on staleness; allow client/matcher backstop to prepend crank when needed.

- **Off-chain read model (Convex-first)**
  - Convex ingests program events/transactions and publishes queryable derived views used by web + ops.
  - Convex is treated as a cache/index, not as a source of truth; the chain remains authoritative.

- **Client stack**
  - Use `@solana/kit` for RPC, transaction building, codecs, and program client usage.
  - Use `@solana/connector` for wallet connection (Wallet Standard).
  - Avoid `@solana/web3.js` unless required by a dependency without kit equivalents.

## Testing Decisions

- **What makes a good test**
  - Test **external behavior and invariants**, not internal implementation details.
  - Prefer “given inputs + accounts → expected state change or expected failure”.
  - Include adversarial/edge cases: stale crank, stale oracle, dust withdrawals, borderline margin, overflow bounds, candidate revalidation behavior.

- **Modules to test**
  - **On-chain instruction integration tests**: open account, deposit, withdraw, trade, crank, liquidation.
  - **Oracle adapter tests**: parsing + validation logic against staleness/confidence policies.
  - **Engine adapter tests**: load/mutate/save correctness and error mapping semantics.
  - **Keeper scenario tests**: staleness gating, liquidation progress under candidate lists.
  - **Convex indexing tests**: event ingestion produces consistent derived views and is idempotent.

- **Prior art**
  - The Percolator kernel’s existing tests and spec-driven approach serve as the model for invariant-focused behavior tests.

## Out of Scope

- Cross-margin between markets
- Multi-collateral margin (beyond USDC)
- Permissionless market creation (v0 is permissioned)
- Multiple matchers / decentralized matcher set (planned later)
- Partial fills / orderbook matching (v0 is IOC swap-like execution)
- Token-2022 support (unless required later)
- Governance beyond basic admin authority and key rotation

## Further Notes

- **Scalability strategy**: scale via multi-market + sharding (additive growth) rather than forcing a redesign of the risk engine.
- **Operational strategy**: cron keepers initially, permissionless endpoints always, client/matcher crank-backstop for UX reliability.
- **Open clarifications to resolve early**
  - House LP funding policy (protocol-funded initially vs adding an LP deposit product later)
  - Target shard sizing and criteria for adding new shards
  - Exact Pyth validation thresholds per market
  - USDC mint selection per cluster and token program choice (legacy SPL vs Token-2022)


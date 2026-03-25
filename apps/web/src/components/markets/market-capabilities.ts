export interface CapabilityItem {
  key: string
  label: string
  state: "working" | "blocked" | "stubbed"
  reason?: string
}

export interface ActionAvailability {
  key: string
  label: string
  reason: string
}

export interface CapabilityContext {
  hasShard: boolean
  hasTrader: boolean
}

export interface CapabilityGroups {
  working: CapabilityItem[]
  blocked: CapabilityItem[]
  stubbed: CapabilityItem[]
}

const SHARD_BLOCK_REASON =
  "Shard bootstrap is blocked because the current engine account is too large for the active creation path."

const NOT_IMPLEMENTED_REASON = "On-chain instruction currently returns NotImplemented."

export function getCapabilityGroups(): CapabilityGroups {
  return {
    working: [
      { key: "market-initialized", label: "Market initialized", state: "working" },
      { key: "convex-indexed", label: "Convex indexed", state: "working" },
      {
        key: "matcher-rotation",
        label: "Matcher rotation available",
        state: "working",
      },
    ],
    blocked: [
      {
        key: "create-shard",
        label: "Create shard",
        state: "blocked",
        reason: SHARD_BLOCK_REASON,
      },
      {
        key: "open-account",
        label: "Open account",
        state: "blocked",
        reason: "Open account remains blocked until shard bootstrap is restored end-to-end.",
      },
    ],
    stubbed: [
      {
        key: "deposit",
        label: "Deposit",
        state: "stubbed",
        reason: NOT_IMPLEMENTED_REASON,
      },
      {
        key: "withdraw",
        label: "Withdraw",
        state: "stubbed",
        reason: NOT_IMPLEMENTED_REASON,
      },
      {
        key: "quote",
        label: "Request quote",
        state: "stubbed",
        reason: NOT_IMPLEMENTED_REASON,
      },
      {
        key: "trade",
        label: "Trade",
        state: "stubbed",
        reason: NOT_IMPLEMENTED_REASON,
      },
      {
        key: "crank",
        label: "Crank",
        state: "stubbed",
        reason: NOT_IMPLEMENTED_REASON,
      },
      {
        key: "liquidate",
        label: "Liquidate",
        state: "stubbed",
        reason: NOT_IMPLEMENTED_REASON,
      },
    ],
  }
}

export function getTraderActionAvailability(
  context: CapabilityContext,
): ActionAvailability[] {
  return [
    {
      key: "open-account",
      label: "Open account",
      reason: !context.hasShard
        ? "Blocked: requires shard."
        : "Blocked: account opening is not enabled in the current protocol version.",
    },
    {
      key: "deposit",
      label: "Deposit",
      reason: !context.hasShard
        ? "Blocked: requires shard."
        : !context.hasTrader
          ? "Blocked: requires trader account."
          : NOT_IMPLEMENTED_REASON,
    },
    {
      key: "withdraw",
      label: "Withdraw",
      reason: !context.hasShard
        ? "Blocked: requires shard."
        : !context.hasTrader
          ? "Blocked: requires trader account."
          : NOT_IMPLEMENTED_REASON,
    },
    {
      key: "quote",
      label: "Request quote",
      reason: !context.hasShard
        ? "Blocked: requires shard."
        : !context.hasTrader
          ? "Blocked: requires trader account."
          : NOT_IMPLEMENTED_REASON,
    },
    {
      key: "trade",
      label: "Trade",
      reason: !context.hasShard
        ? "Blocked: requires shard."
        : !context.hasTrader
          ? "Blocked: requires trader account."
          : NOT_IMPLEMENTED_REASON,
    },
    {
      key: "crank",
      label: "Crank",
      reason: !context.hasShard
        ? "Blocked: requires shard."
        : NOT_IMPLEMENTED_REASON,
    },
    {
      key: "liquidate",
      label: "Liquidate",
      reason: !context.hasShard
        ? "Blocked: requires shard."
        : NOT_IMPLEMENTED_REASON,
    },
  ]
}

export function getCreateShardReason(): string {
  return `Disabled: ${SHARD_BLOCK_REASON}`
}

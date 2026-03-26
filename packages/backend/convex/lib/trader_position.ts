export interface TradingConfigShape {
  initialMarginBps: number
  maintenanceMarginBps: number
  removableCollateralBufferBps: number
}

export interface TradeLike {
  sizeQ: bigint
  execPrice: bigint
  slot?: bigint
  indexedAt?: number
}

export interface PersistedPositionLike {
  positionSizeQ: bigint
  averageEntryPrice?: bigint
  realizedPnl?: bigint
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value
}

function maxBigInt(left: bigint, right: bigint): bigint {
  return left > right ? left : right
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right
}

export function computePositionAccountingFromTrades(trades: TradeLike[]) {
  let currentSizeQ = 0n
  let averageEntryPrice = 0n
  let realizedPnl = 0n

  const sortedTrades = [...trades].sort((left, right) => {
    const slotDiff = Number((left.slot ?? 0n) - (right.slot ?? 0n))
    if (slotDiff !== 0) return slotDiff
    return (left.indexedAt ?? 0) - (right.indexedAt ?? 0)
  })

  for (const trade of sortedTrades) {
    const fillSizeQ = trade.sizeQ
    const fillPrice = trade.execPrice
    if (fillSizeQ === 0n) continue

    if (currentSizeQ === 0n) {
      currentSizeQ = fillSizeQ
      averageEntryPrice = fillPrice
      continue
    }

    const currentSide = currentSizeQ > 0n ? 1n : -1n
    const fillSide = fillSizeQ > 0n ? 1n : -1n

    if (currentSide === fillSide) {
      const currentAbs = absBigInt(currentSizeQ)
      const fillAbs = absBigInt(fillSizeQ)
      const nextAbs = currentAbs + fillAbs
      averageEntryPrice =
        ((currentAbs * averageEntryPrice) + (fillAbs * fillPrice)) / nextAbs
      currentSizeQ += fillSizeQ
      continue
    }

    const currentAbs = absBigInt(currentSizeQ)
    const fillAbs = absBigInt(fillSizeQ)
    const closingAbs = minBigInt(currentAbs, fillAbs)

    if (currentSide > 0n)
      realizedPnl += ((fillPrice - averageEntryPrice) * closingAbs) / 1_000_000n
    else realizedPnl += ((averageEntryPrice - fillPrice) * closingAbs) / 1_000_000n

    if (fillAbs < currentAbs) {
      currentSizeQ += fillSizeQ
      continue
    }

    if (fillAbs === currentAbs) {
      currentSizeQ = 0n
      averageEntryPrice = 0n
      continue
    }

    const residualAbs = fillAbs - currentAbs
    currentSizeQ = fillSide > 0n ? residualAbs : -residualAbs
    averageEntryPrice = fillPrice
  }

  return {
    positionSizeQ: currentSizeQ,
    averageEntryPrice,
    realizedPnl,
  }
}

export function computePositionRiskSnapshot(args: {
  persistedPosition?: PersistedPositionLike | null
  markPrice: bigint
  collateralBalance: bigint
  config: TradingConfigShape
  tradesFallback?: TradeLike[]
}) {
  const accounting =
    args.persistedPosition?.averageEntryPrice != null
      ? {
          positionSizeQ: args.persistedPosition.positionSizeQ,
          averageEntryPrice: args.persistedPosition.averageEntryPrice ?? 0n,
          realizedPnl: args.persistedPosition.realizedPnl ?? 0n,
        }
      : computePositionAccountingFromTrades(args.tradesFallback ?? [])

  const currentSizeQ = accounting.positionSizeQ
  const averageEntryPrice = accounting.averageEntryPrice
  const realizedPnl = accounting.realizedPnl
  const side =
    currentSizeQ > 0n
      ? ("long" as const)
      : currentSizeQ < 0n
        ? ("short" as const)
        : ("flat" as const)
  const sizeQAbs = absBigInt(currentSizeQ)
  const notional = (sizeQAbs * args.markPrice) / 1_000_000n
  const unrealizedPnl =
    currentSizeQ === 0n
      ? 0n
      : currentSizeQ > 0n
        ? ((args.markPrice - averageEntryPrice) * sizeQAbs) / 1_000_000n
        : ((averageEntryPrice - args.markPrice) * sizeQAbs) / 1_000_000n
  const effectiveCollateralBalance = args.collateralBalance + realizedPnl
  const equity = effectiveCollateralBalance + unrealizedPnl
  const initialMarginRequirement =
    (notional * BigInt(args.config.initialMarginBps)) / 10_000n
  const maintenanceMargin =
    (notional * BigInt(args.config.maintenanceMarginBps)) / 10_000n
  const usedMargin = currentSizeQ === 0n ? 0n : initialMarginRequirement
  const availableMargin = maxBigInt(equity - usedMargin, 0n)
  const effectiveLeverageX100 =
    equity > 0n ? Number((notional * 100n) / equity) : 0
  const collateralFloor =
    (maintenanceMargin * BigInt(10_000 + args.config.removableCollateralBufferBps)) /
    10_000n
  const removableCollateral = minBigInt(
    effectiveCollateralBalance,
    maxBigInt(equity - collateralFloor, 0n),
  )
  const marginRatioBps =
    equity > 0n ? Number((maintenanceMargin * 10_000n) / equity) : 0

  let liquidationPrice: bigint | null = null
  if (currentSizeQ !== 0n && averageEntryPrice > 0n) {
    const mm = BigInt(args.config.maintenanceMarginBps)
    const entryNotional = (sizeQAbs * averageEntryPrice) / 1_000_000n
    if (currentSizeQ > 0n) {
      const denominator = sizeQAbs * (10_000n - mm)
      const numerator = (entryNotional - args.collateralBalance) * 10_000n
      if (denominator > 0n && numerator > 0n)
        liquidationPrice = (numerator * 1_000_000n) / denominator
    } else {
      const denominator = sizeQAbs * (10_000n + mm)
      const numerator = (entryNotional + args.collateralBalance) * 10_000n
      if (denominator > 0n) liquidationPrice = (numerator * 1_000_000n) / denominator
    }
  }

  return {
    side,
    sizeQ: currentSizeQ,
    notional,
    averageEntryPrice,
    markPrice: args.markPrice,
    unrealizedPnl,
    realizedPnl,
    effectiveLeverageX100,
    allocatedCollateral: effectiveCollateralBalance,
    initialMarginRequirement,
    maintenanceMargin,
    usedMargin,
    availableMargin,
    equity,
    removableCollateral,
    marginRatioBps,
    liquidationPrice,
  }
}

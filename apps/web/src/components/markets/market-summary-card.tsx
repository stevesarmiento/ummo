import Link from "next/link"

import type { MarketSummary } from "@/lib/market-data"
import { formatAddress, formatFixedDecimal, formatSignedFixedDecimal, toBigInt } from "@/lib/market-format"

interface MarketSummaryCardProps {
  summary: MarketSummary
  mode: "lp" | "trade"
}

function getStatusPillClassName(isActive: boolean): string {
  return isActive
    ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
    : "bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-300"
}

function getPrimaryHref(summary: MarketSummary, mode: "lp" | "trade"): string {
  return mode === "lp"
    ? `/markets/${encodeURIComponent(summary.market)}`
    : `/trade/${encodeURIComponent(summary.market)}`
}

export function MarketSummaryCard(props: MarketSummaryCardProps) {
  const totalPoolNav = toBigInt(props.summary.totalPoolNav) ?? 0n
  const configuredDepth = toBigInt(props.summary.configuredDepthNotional) ?? 0n
  const tradedNotional24h = toBigInt(props.summary.tradedNotional24h) ?? 0n
  const lpPnlEstimate = toBigInt(props.summary.lpPnlEstimate) ?? 0n

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
              Market {props.summary.marketId}
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getStatusPillClassName(
                props.summary.tradeable,
              )}`}
            >
              {props.summary.tradeable ? "Tradeable" : "Bootstrapping"}
            </span>
          </div>
          <div className="text-xs text-zinc-600 dark:text-zinc-300">
            <span className="font-mono">{formatAddress(props.summary.market)}</span>
          </div>
        </div>

        <Link
          href={getPrimaryHref(props.summary, props.mode)}
          className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white dark:bg-white dark:text-zinc-950"
        >
          {props.mode === "lp" ? "Provide liquidity" : "Open trade"}
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div className="rounded-xl border border-black/10 p-3 dark:border-white/10">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Pool NAV</div>
          <div className="mt-1 font-medium text-zinc-950 dark:text-zinc-50">
            {formatFixedDecimal(totalPoolNav, 6)} USDC
          </div>
        </div>
        <div className="rounded-xl border border-black/10 p-3 dark:border-white/10">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {props.mode === "lp" ? "Configured depth" : "Displayed depth"}
          </div>
          <div className="mt-1 font-medium text-zinc-950 dark:text-zinc-50">
            {formatFixedDecimal(configuredDepth, 6)} USDC
          </div>
        </div>
        <div className="rounded-xl border border-black/10 p-3 dark:border-white/10">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">24h traded</div>
          <div className="mt-1 font-medium text-zinc-950 dark:text-zinc-50">
            {formatFixedDecimal(tradedNotional24h, 6)} USDC
          </div>
        </div>
        <div className="rounded-xl border border-black/10 p-3 dark:border-white/10">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {props.mode === "lp" ? "LP PnL est." : "LP makers"}
          </div>
          <div className="mt-1 font-medium text-zinc-950 dark:text-zinc-50">
            {props.mode === "lp"
              ? `${formatSignedFixedDecimal(lpPnlEstimate, 6)} USDC`
              : props.summary.lpOwnerCount.toString(10)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-zinc-600 dark:text-zinc-300 md:grid-cols-3">
        <div>
          Pools <span className="font-mono">{props.summary.poolCount}</span>, shards{" "}
          <span className="font-mono">{props.summary.shardCount}</span>, traders{" "}
          <span className="font-mono">{props.summary.traderCount}</span>
        </div>
        <div>
          Bands configured by{" "}
          <span className="font-mono">{props.summary.configuredBandOwnerCount}</span> LPs
        </div>
        <div>
          {props.summary.lastCrankSlot ? (
            <>
              Last crank <span className="font-mono">{props.summary.lastCrankSlot}</span>
            </>
          ) : (
            <>No crank indexed yet</>
          )}
        </div>
      </div>
    </div>
  )
}

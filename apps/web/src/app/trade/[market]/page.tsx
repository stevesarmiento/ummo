import Link from "next/link"
import { notFound } from "next/navigation"

import { MarketShell } from "@/components/markets/market-shell"
import { TraderMarketClient } from "@/components/markets/trader-market-client"
import {
  getMarketDetail,
  getMarketQuoteStats,
  getTradeMarketSummary,
} from "@/lib/market-data"
import { formatAddress, formatFixedDecimal, toBigInt } from "@/lib/market-format"

export default async function TradeMarketPage(props: {
  params: Promise<{ market: string }>
  searchParams?: Promise<{ shard?: string }>
}) {
  const params = await props.params
  const searchParams = props.searchParams ? await props.searchParams : undefined
  const market = decodeURIComponent(params.market)
  const detail = await getMarketDetail({
    market,
    requestedShard: searchParams?.shard,
  })
  if (!detail) notFound()

  const summary = await getTradeMarketSummary(market)
  const quoteStats = await getMarketQuoteStats(market)
  const hasShard = Boolean(detail.selectedShard)

  return (
    <MarketShell
      title={`Trade market ${summary?.marketId ?? ""}`.trim()}
      description="Trade LP-backed liquidity with a trader-first market page focused on execution, depth, and current position context."
      section="trade"
      breadcrumbs={[
        { href: "/trade", label: "Trade" },
        { label: detail.doc.market },
      ]}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Trading summary
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Configured depth</div>
              <div className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {formatFixedDecimal(toBigInt(summary?.configuredDepthNotional) ?? 0n, 6)} USDC
              </div>
            </div>
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">24h traded</div>
              <div className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {formatFixedDecimal(toBigInt(summary?.tradedNotional24h) ?? 0n, 6)} USDC
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <div>
              Market <span className="font-mono">{formatAddress(detail.doc.market)}</span>
            </div>
            <div>
              Matcher <span className="font-mono">{formatAddress(detail.doc.matcherAuthority)}</span>
            </div>
            <div>
              Oracle feed <span className="font-mono">{formatAddress(detail.doc.oracleFeed)}</span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Shard selection
          </h2>
          {hasShard ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.shards.map((shard) => {
                const isSelected = shard.shard === detail.selectedShard?.shard
                return (
                  <Link
                    key={shard.shard}
                    href={`/trade/${encodeURIComponent(market)}?shard=${encodeURIComponent(shard.shard)}`}
                    className={`inline-flex h-9 items-center justify-center rounded-full border px-3 text-sm font-medium ${
                      isSelected
                        ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                        : "border-black/10 text-zinc-700 dark:border-white/10 dark:text-zinc-200"
                    }`}
                  >
                    Shard {shard.shardId}
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-black/10 p-4 text-sm text-zinc-600 dark:border-white/10 dark:text-zinc-300">
              No shard is indexed for this market yet.
            </div>
          )}
        </section>
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Quotes 24h</div>
          <div className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {quoteStats.quotes24h.toString(10)}
          </div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Fallback rate</div>
          <div className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {(quoteStats.fallbackRateBps / 100).toFixed(2)}%
          </div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Fallback notional 24h</div>
          <div className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {formatFixedDecimal(toBigInt(quoteStats.totalFallbackNotional) ?? 0n, 6)} USDC
          </div>
        </div>
      </section>

      <TraderMarketClient
        market={detail.doc.market}
        collateralMint={detail.doc.collateralMint}
        oracleFeed={detail.doc.oracleFeed}
        matcherAuthority={detail.doc.matcherAuthority}
        shard={detail.selectedShard?.shard ?? null}
        lastCrankSlot={detail.selectedShard?.lastCrankSlot ?? null}
        summary={summary}
      />
    </MarketShell>
  )
}

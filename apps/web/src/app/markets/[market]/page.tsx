import Link from "next/link"
import { notFound } from "next/navigation"

import { LpMarketClient } from "@/components/markets/lp-market-client"
import { MarketShell } from "@/components/markets/market-shell"
import {
  getLpMarketSummary,
  getMarketDetail,
  getMarketQuoteStats,
} from "@/lib/market-data"
import { formatAddress, formatFixedDecimal, toBigInt } from "@/lib/market-format"

export default async function MarketPage(props: {
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

  const summary = await getLpMarketSummary(market)
  const quoteStats = await getMarketQuoteStats(market)
  const hasShard = Boolean(detail.selectedShard)

  return (
    <MarketShell
      title={`LP market ${summary?.marketId ?? ""}`.trim()}
      description="Review pooled LP health, provide liquidity, and tune your quote bands for this market."
      section="lp"
      breadcrumbs={[
        { href: "/markets", label: "LP markets" },
        { label: detail.doc.market },
      ]}
      actions={
        <Link
          href={`/admin/markets/${encodeURIComponent(detail.doc.market)}`}
          className="hidden text-xs font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300 md:inline"
        >
          Admin tools
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            LP market summary
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Pool NAV</div>
              <div className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {formatFixedDecimal(toBigInt(summary?.totalPoolNav) ?? 0n, 6)} USDC
              </div>
            </div>
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Configured depth</div>
              <div className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {formatFixedDecimal(toBigInt(summary?.configuredDepthNotional) ?? 0n, 6)} USDC
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <div>
              Market <span className="font-mono">{formatAddress(detail.doc.market)}</span>
            </div>
            <div>
              Collateral mint{" "}
              <span className="font-mono">{formatAddress(detail.doc.collateralMint)}</span>
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
                    href={`/markets/${encodeURIComponent(market)}?shard=${encodeURIComponent(shard.shard)}`}
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

      <LpMarketClient
        market={detail.doc.market}
        authority={detail.doc.authority}
        collateralMint={detail.doc.collateralMint}
        oracleFeed={detail.doc.oracleFeed}
        shard={detail.selectedShard?.shard ?? null}
        summary={summary}
      />
    </MarketShell>
  )
}


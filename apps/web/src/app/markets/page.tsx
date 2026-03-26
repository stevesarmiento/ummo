import { MarketShell } from "@/components/markets/market-shell"
import { MarketSummaryCard } from "@/components/markets/market-summary-card"
import { listLpMarketSummaries } from "@/lib/market-data"

export default async function MarketsPage() {
  const { markets, errorMessage } = await getMarkets()

  return (
    <MarketShell
      title="LP markets"
      description="Browse LP-backed markets, compare pooled liquidity opportunities, and manage your provide-liquidity workflows."
      section="lp"
    >
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4">
        {markets.length ? (
          markets.map((market) => (
            <MarketSummaryCard key={market.market} summary={market} mode="lp" />
          ))
        ) : (
          <div className="rounded-2xl border border-black/10 bg-white p-6 text-sm text-zinc-600 dark:border-white/10 dark:bg-black dark:text-zinc-300">
            No LP markets are indexed yet.
          </div>
        )}
      </div>
    </MarketShell>
  )
}

async function getMarkets(): Promise<{
  markets: Awaited<ReturnType<typeof listLpMarketSummaries>>
  errorMessage: string | null
}> {
  try {
    const markets = await listLpMarketSummaries()
    return { markets, errorMessage: null }
  } catch (error) {
    return {
      markets: [],
      errorMessage:
        error instanceof Error ? error.message : "Failed to fetch markets",
    }
  }
}


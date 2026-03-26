import { MarketShell } from "@/components/markets/market-shell"
import { MarketSummaryCard } from "@/components/markets/market-summary-card"
import { listTradeMarketSummaries } from "@/lib/market-data"

export default async function TradePage() {
  const { markets, errorMessage } = await getMarkets()

  return (
    <MarketShell
      title="Tradeable markets"
      description="Discover LP-backed markets that are ready for position opening and execution."
      section="trade"
    >
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4">
        {markets.length ? (
          markets.map((market) => (
            <MarketSummaryCard key={market.market} summary={market} mode="trade" />
          ))
        ) : (
          <div className="rounded-2xl border border-black/10 bg-white p-6 text-sm text-zinc-600 dark:border-white/10 dark:bg-black dark:text-zinc-300">
            No tradeable markets are indexed yet.
          </div>
        )}
      </div>
    </MarketShell>
  )
}

async function getMarkets(): Promise<{
  markets: Awaited<ReturnType<typeof listTradeMarketSummaries>>
  errorMessage: string | null
}> {
  try {
    const markets = await listTradeMarketSummaries()
    return { markets, errorMessage: null }
  } catch (error) {
    return {
      markets: [],
      errorMessage:
        error instanceof Error ? error.message : "Failed to fetch tradeable markets",
    }
  }
}

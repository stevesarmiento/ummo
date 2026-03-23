import Link from "next/link"

import { ConnectButton } from "@/components/wallet/connect-button"
import { convexQuery } from "@/lib/convex-http"

interface MarketDoc {
  _id: string
  _creationTime: number
  market: string
  authority: string
  collateralMint: string
  oracleFeed: string
  matcherAuthority: string
  marketId: unknown
  createdAtSlot: unknown
  indexedAt: number
}

export default async function MarketsPage() {
  const { markets, errorMessage } = await getMarkets()

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-black/60">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Ummo
            </Link>
            <Link
              href="/admin/ops"
              className="text-xs font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
            >
              Ops
            </Link>
          </div>
          <ConnectButton />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Markets</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Indexed from Convex.
          </p>
        </div>

        {errorMessage ? (
          <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-red-700 dark:border-white/10 dark:bg-black dark:text-red-300">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3">
          {markets.length ? (
            markets.map((m) => (
              <div
                key={m._id}
                className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{formatMarketId(m.marketId)}</div>
                    <Link
                      href={`/markets/${encodeURIComponent(m.market)}`}
                      className="text-sm font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
                    >
                      View
                    </Link>
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-300">
                    <span className="font-mono">{m.market}</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-black/10 bg-white p-6 text-sm text-zinc-600 dark:border-white/10 dark:bg-black dark:text-zinc-300">
              No markets yet.
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

async function getMarkets(): Promise<{
  markets: MarketDoc[]
  errorMessage: string | null
}> {
  try {
    const markets = await convexQuery<MarketDoc[]>("markets:list", {})
    return { markets, errorMessage: null }
  } catch (error) {
    return {
      markets: [],
      errorMessage:
        error instanceof Error ? error.message : "Failed to fetch markets",
    }
  }
}

function formatMarketId(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number") return `${value}`
  if (typeof value === "bigint") return value.toString(10)
  return "Market"
}


import Link from "next/link"

import { convexAction } from "@/lib/convex-http"

interface OpsMarketRow {
  market: string
  marketId: string
  authority: string
  oracleFeed: string
  matcherAuthority: string
  createdAtSlot: string
  indexedAt: number
}

interface OpsShardRow {
  market: string
  shard: string
  shardId: number
  shardSeed: string
  lastCrankSlot: string
  stalenessSlots: string
  isStale: boolean
  liquidations24h: number
  trades24h: number
  indexedAt: number
}

interface MatcherErrorRow {
  kind: string
  message: string
  signer: string | null
  oracleFeed: string | null
  rpcUrl: string | null
  indexedAt: number
}

interface OpsDashboard {
  rpcUrl: string
  nowSlot: string
  maxCrankStalenessSlots: string
  markets: OpsMarketRow[]
  shards: OpsShardRow[]
  matcherErrors: MatcherErrorRow[]
}

export default async function OpsPage() {
  const dashboard = await convexAction<OpsDashboard>("ops:getDashboard", {})

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-black/60">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Ummo
            </Link>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">/</span>
            <Link href="/markets" className="text-sm font-semibold tracking-tight">
              Markets
            </Link>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">/</span>
            <span className="text-sm font-semibold tracking-tight">Ops</span>
          </div>
          <div className="text-xs text-zinc-600 dark:text-zinc-300">
            slot <span className="font-mono">{dashboard.nowSlot}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Ops dashboard</h1>
          <div className="text-sm text-zinc-600 dark:text-zinc-300">
            RPC: <span className="font-mono">{dashboard.rpcUrl}</span>
          </div>
          <div className="text-sm text-zinc-600 dark:text-zinc-300">
            Hard stale threshold:{" "}
            <span className="font-mono">{dashboard.maxCrankStalenessSlots}</span> slots
          </div>
        </div>

        <section className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Shards</div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-black/10 text-zinc-600 dark:border-white/10 dark:text-zinc-300">
                  <th className="py-2 pr-4">Market</th>
                  <th className="py-2 pr-4">Shard</th>
                  <th className="py-2 pr-4">Last crank</th>
                  <th className="py-2 pr-4">Staleness</th>
                  <th className="py-2 pr-4">24h liq</th>
                  <th className="py-2 pr-4">24h trades</th>
                </tr>
              </thead>
              <tbody className="text-zinc-700 dark:text-zinc-200">
                {dashboard.shards.map((s) => (
                  <tr key={s.shard} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-4">
                      <span className="font-mono">{s.market.slice(0, 8)}…</span>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-col">
                        <span className="font-medium">Shard {s.shardId}</span>
                        <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                          {s.shard}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="font-mono">{s.lastCrankSlot}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{s.stalenessSlots}</span>
                        {s.isStale ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                            Stale
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                            Fresh
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="font-mono">{s.liquidations24h}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="font-mono">{s.trades24h}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
            Matcher errors (recent)
          </div>
          <div className="mt-3 flex flex-col gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            {dashboard.matcherErrors.length ? (
              dashboard.matcherErrors.map((e) => (
                <div key={`${e.kind}:${e.indexedAt}`} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
                      {e.kind}
                    </span>
                    <span className="font-medium text-zinc-950 dark:text-zinc-50">
                      {new Date(e.indexedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-[11px]">{e.message}</div>
                  {e.signer ? (
                    <div className="mt-2">
                      signer: <span className="font-mono">{e.signer}</span>
                    </div>
                  ) : null}
                  {e.oracleFeed ? (
                    <div className="mt-1">
                      oracle: <span className="font-mono">{e.oracleFeed}</span>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
                No matcher errors recorded.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}


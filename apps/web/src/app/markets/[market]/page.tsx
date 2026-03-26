import Link from "next/link"
import { notFound } from "next/navigation"

import { MarketAdminClient } from "@/components/markets/market-admin-client"
import { ConnectButton } from "@/components/connector"
import { convexQuery } from "@/lib/convex-http"

interface MarketDoc {
  market: string
  authority: string
  collateralMint: string
  oracleFeed: string
  matcherAuthority: string
  marketId: unknown
}

interface ShardDoc {
  shard: string
  market: string
  shardSeed: string
  shardId: number
  houseEngineIndex: number
  lastCrankSlot: unknown
}

export default async function MarketPage(props: {
  params: Promise<{ market: string }>
  searchParams?: Promise<{ shard?: string }>
}) {
  const params = await props.params
  const searchParams = props.searchParams ? await props.searchParams : undefined
  const market = decodeURIComponent(params.market)
  const doc = await convexQuery<MarketDoc | null>("markets:getByMarket", { market })
  if (!doc) notFound()

  const shards = await convexQuery<ShardDoc[]>("shards:listByMarket", { market })
  const requestedShard = searchParams?.shard
  const selectedShard =
    (requestedShard ? shards.find((s) => s.shard === requestedShard) : null) ??
    shards[0] ??
    null
  const hasShard = Boolean(selectedShard)
  const isTradeable = false

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-black/60">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/markets" className="text-sm font-semibold tracking-tight">
              Markets
            </Link>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">/</span>
            <span className="font-mono text-xs text-zinc-700 dark:text-zinc-200">
              {market}
            </span>
          </div>
          <ConnectButton />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Market</h1>
        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Market status
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-zinc-600 dark:text-zinc-300 sm:grid-cols-2">
              <div className="flex flex-col">
                <span className="font-medium">Market</span>
                <span className="font-mono">{doc.market}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Authority</span>
                <span className="font-mono">{doc.authority}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Collateral mint</span>
                <span className="font-mono">{doc.collateralMint}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Oracle feed</span>
                <span className="font-mono">{doc.oracleFeed}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Matcher authority</span>
                <span className="font-mono">{doc.matcherAuthority}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Market id</span>
                <span className="font-mono">{formatUnknown(doc.marketId)}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Shard count</span>
                <span className="font-mono">{shards.length.toString(10)}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Tradeable</span>
                <span className="font-mono">{isTradeable ? "Yes" : "No"}</span>
              </div>
            </div>
            {!hasShard ? (
              <div className="mt-4 rounded-lg border border-black/10 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                <div className="font-medium">Market created</div>
                <div className="mt-1">
                  No shards initialized yet. Trading is unavailable until shard
                  bootstrap is solved.
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Shards
            </div>
            {hasShard ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {shards.map((s) => {
                  const isSelected = s.shard === selectedShard?.shard
                  return (
                    <Link
                      key={s.shard}
                      href={`/markets/${encodeURIComponent(market)}?shard=${encodeURIComponent(
                        s.shard,
                      )}`}
                      className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium ${
                        isSelected
                          ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                          : "border-black/10 bg-white text-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50"
                      }`}
                    >
                      Shard {s.shardId}
                    </Link>
                  )
                })}
              </div>
            ) : (
              <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
                No shards indexed for this market yet.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Addresses
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <div className="flex flex-col">
                <span className="font-medium">Market</span>
                <span className="font-mono">{doc.market}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Authority</span>
                <span className="font-mono">{doc.authority}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Shard</span>
                <span className="font-mono">{selectedShard?.shard ?? "None"}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Shard seed</span>
                <span className="font-mono">{selectedShard?.shardSeed ?? "None"}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Collateral mint</span>
                <span className="font-mono">{doc.collateralMint}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Oracle feed</span>
                <span className="font-mono">{doc.oracleFeed}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Matcher authority</span>
                <span className="font-mono">{doc.matcherAuthority}</span>
              </div>
            </div>
          </div>

          <MarketAdminClient
            market={doc.market}
            authority={doc.authority}
            collateralMint={doc.collateralMint}
            shard={selectedShard?.shard ?? null}
            oracleFeed={doc.oracleFeed}
            matcherAuthority={doc.matcherAuthority}
            lastCrankSlot={selectedShard?.lastCrankSlot ?? null}
          />
        </div>
      </main>
    </div>
  )
}

function formatUnknown(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number") return `${value}`
  if (typeof value === "bigint") return value.toString(10)
  return "Unknown"
}


import Link from "next/link"
import { notFound } from "next/navigation"

import { MarketClient } from "@/components/markets/market-client"
import { ConnectButton } from "@/components/connector"
import { convexQuery } from "@/lib/convex-http"

interface MarketDoc {
  market: string
  authority: string
  collateralMint: string
  oracleFeed: string
  matcherAuthority: string
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
  params: { market: string }
  searchParams?: { shard?: string }
}) {
  const market = decodeURIComponent(props.params.market)
  const doc = await convexQuery<MarketDoc | null>("markets:getByMarket", { market })
  if (!doc) notFound()

  const shards = await convexQuery<ShardDoc[]>("shards:listByMarket", { market })
  const requestedShard = props.searchParams?.shard
  const selectedShard =
    (requestedShard ? shards.find((s) => s.shard === requestedShard) : null) ??
    shards[0] ??
    null

  if (!selectedShard) notFound()

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
              Shards
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {shards.map((s) => {
                const isSelected = s.shard === selectedShard.shard
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
                <span className="font-mono">{selectedShard.shard}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Shard seed</span>
                <span className="font-mono">{selectedShard.shardSeed}</span>
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

          <MarketClient
            market={doc.market}
            authority={doc.authority}
            shard={selectedShard.shard}
            collateralMint={doc.collateralMint}
            oracleFeed={doc.oracleFeed}
            matcherAuthority={doc.matcherAuthority}
            lastCrankSlot={selectedShard.lastCrankSlot}
          />
        </div>
      </main>
    </div>
  )
}


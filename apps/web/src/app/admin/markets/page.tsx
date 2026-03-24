import Link from "next/link"

import { ConnectButton } from "@/components/connector"
import { InitMarketClient } from "@/components/markets/init-market-client"

export default function AdminMarketsPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-black/60">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Ummo
            </Link>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">/</span>
            <Link href="/markets" className="text-sm font-semibold tracking-tight">
              Markets
            </Link>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">/</span>
            <span className="text-sm font-semibold tracking-tight">Admin</span>
          </div>
          <ConnectButton />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Admin: markets</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Initialize a market using your connected wallet, then index it into Convex so it appears on{" "}
            <Link
              href="/markets"
              className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
            >
              /markets
            </Link>
            .
          </p>
        </div>

        <InitMarketClient />
      </main>
    </div>
  )
}


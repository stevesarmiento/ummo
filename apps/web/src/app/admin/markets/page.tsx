import Link from "next/link"

import { InitMarketClient } from "@/components/markets/init-market-client"
import { MarketShell } from "@/components/markets/market-shell"

export default function AdminMarketsPage() {
  return (
    <MarketShell
      title="Admin markets"
      description="Initialize markets and jump into operator tooling without mixing admin controls into LP or trader pages."
      section="admin"
      breadcrumbs={[{ href: "/admin/ops", label: "Admin" }, { label: "Markets" }]}
    >
      <div className="text-sm text-zinc-600 dark:text-zinc-300">
        Initialize a market using your connected wallet, then index it into Convex so it appears on{" "}
        <Link
          href="/markets"
          className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
        >
          /markets
        </Link>
        .
      </div>
        <InitMarketClient />
    </MarketShell>
  )
}


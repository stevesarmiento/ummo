import { notFound } from "next/navigation"

import { MarketAdminClient } from "@/components/markets/market-admin-client"
import { MarketShell } from "@/components/markets/market-shell"
import { getMarketDetail } from "@/lib/market-data"

export default async function AdminMarketPage(props: {
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

  return (
    <MarketShell
      title="Admin market tools"
      description="Operator-only market controls and protocol debugging for the selected market."
      section="admin"
      breadcrumbs={[
        { href: "/admin/markets", label: "Admin markets" },
        { label: detail.doc.market },
      ]}
    >
      <MarketAdminClient
        market={detail.doc.market}
        authority={detail.doc.authority}
        collateralMint={detail.doc.collateralMint}
        shard={detail.selectedShard?.shard ?? null}
        oracleFeed={detail.doc.oracleFeed}
        matcherAuthority={detail.doc.matcherAuthority}
        lastCrankSlot={detail.selectedShard?.lastCrankSlot ?? null}
      />
    </MarketShell>
  )
}

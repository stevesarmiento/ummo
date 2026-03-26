import Link from "next/link"
import type { ReactNode } from "react"

import { ConnectButton } from "@/components/connector"

interface MarketShellProps {
  title: string
  description: string
  section: "lp" | "trade" | "admin"
  children: ReactNode
  breadcrumbs?: Array<{
    href?: string
    label: string
  }>
  actions?: ReactNode
}

function getNavClassName(isActive: boolean): string {
  return [
    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
    isActive
      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
      : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50",
  ].join(" ")
}

export function MarketShell(props: MarketShellProps) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-black/60">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Ummo
            </Link>
            <nav className="flex items-center gap-1 rounded-full border border-black/10 bg-white/80 p-1 dark:border-white/10 dark:bg-white/5">
              <Link href="/markets" className={getNavClassName(props.section === "lp")}>
                LP markets
              </Link>
              <Link href="/trade" className={getNavClassName(props.section === "trade")}>
                Trade
              </Link>
              <Link href="/admin/ops" className={getNavClassName(props.section === "admin")}>
                Admin
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {props.actions}
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
        {props.breadcrumbs?.length ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            {props.breadcrumbs.map((item, index) => (
              <span key={`${item.label}-${index}`} className="flex items-center gap-2">
                {item.href ? (
                  <Link
                    href={item.href}
                    className="hover:text-zinc-950 dark:hover:text-zinc-50"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="font-medium text-zinc-700 dark:text-zinc-200">
                    {item.label}
                  </span>
                )}
                {index < props.breadcrumbs!.length - 1 ? <span>/</span> : null}
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {props.description}
          </p>
        </div>

        {props.children}
      </main>
    </div>
  )
}

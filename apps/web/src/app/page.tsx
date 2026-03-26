import Link from "next/link"

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-20 dark:bg-black">
      <main className="w-full max-w-3xl rounded-2xl border border-black/10 bg-white p-10 dark:border-white/10 dark:bg-black">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Ummo</h1>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            LP-backed SOL perps with dedicated LP and trader journeys.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/markets"
            className="inline-flex h-10 items-center justify-center rounded-full bg-black px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            LP markets
          </Link>
          <Link
            href="/trade"
            className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-50 dark:hover:bg-white/10"
          >
            Trade
          </Link>
          <Link
            href="/admin/ops"
            className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-50 dark:hover:bg-white/10"
          >
            Admin
          </Link>
        </div>
      </main>
    </div>
  )
}

interface ConvexSuccess<T> {
  status: "success"
  value: T
  logLines: string[]
}

interface ConvexError {
  status: "error"
  errorMessage: string
  errorData?: unknown
  logLines: string[]
}

type ConvexResponse<T> = ConvexSuccess<T> | ConvexError

function getArg(name: string): string | null {
  const argv = process.argv.slice(2)
  const idx = argv.indexOf(name)
  if (idx === -1) return null
  return argv[idx + 1] ?? null
}

function getPositionalArgs(): string[] {
  const argv = process.argv.slice(2)
  const out: string[] = []
  for (let i = 0; i < argv.length; i += 1) {
    const entry = argv[i]
    if (!entry) continue
    if (entry.startsWith("--")) {
      i += 1
      continue
    }
    out.push(entry)
  }
  return out
}

async function callConvexAction<T>(args: {
  convexUrl: string
  path: string
  args: Record<string, unknown>
}): Promise<T> {
  const res = await fetch(`${args.convexUrl}/api/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: args.path, args: args.args, format: "json" }),
  })
  if (!res.ok) throw new Error(`Convex action failed (${res.status})`)

  const json = (await res.json()) as ConvexResponse<T>
  if (json.status === "success") return json.value
  throw new Error(json.errorMessage)
}

async function main() {
  const convexUrl =
    getArg("--convex-url") ??
    process.env.CONVEX_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL ??
    null
  if (!convexUrl) throw new Error("Missing --convex-url (or CONVEX_URL env var).")

  const rpcUrl =
    getArg("--rpc-url") ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com"

  const signatures = getPositionalArgs()
  if (!signatures.length)
    throw new Error(
      "Provide one or more transaction signatures as positional args.",
    )

  const results: Array<{
    signature: string
    indexed: unknown
  }> = []

  for (const signature of signatures) {
    const value = await callConvexAction({
      convexUrl,
      path: "indexer:indexTransaction",
      args: { signature, rpcUrl },
    })
    results.push({ signature, indexed: value })
  }

  console.log(JSON.stringify({ convexUrl, rpcUrl, results }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})


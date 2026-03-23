import { getRequiredPublicEnv } from "./env"

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

export async function convexQuery<T>(
  path: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { NEXT_PUBLIC_CONVEX_URL } = getRequiredPublicEnv()

  const res = await fetch(`${NEXT_PUBLIC_CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
    cache: "no-store",
  })

  if (!res.ok) throw new Error(`Convex query failed (${res.status})`)

  const json = (await res.json()) as ConvexResponse<T>
  if (json.status === "success") return json.value
  throw new Error(json.errorMessage)
}

export async function convexAction<T>(
  path: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { NEXT_PUBLIC_CONVEX_URL } = getRequiredPublicEnv()

  const res = await fetch(`${NEXT_PUBLIC_CONVEX_URL}/api/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
    cache: "no-store",
  })

  if (!res.ok) throw new Error(`Convex action failed (${res.status})`)

  const json = (await res.json()) as ConvexResponse<T>
  if (json.status === "success") return json.value
  throw new Error(json.errorMessage)
}


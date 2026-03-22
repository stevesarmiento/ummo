export interface PublicEnv {
  NEXT_PUBLIC_CONVEX_URL?: string
}

export const env: PublicEnv = {
  NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
}

export function getRequiredPublicEnv(): Required<PublicEnv> {
  const convexUrl = env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL")

  return {
    NEXT_PUBLIC_CONVEX_URL: convexUrl,
  }
}


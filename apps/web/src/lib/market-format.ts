export function toBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value
  if (typeof value === "number") return BigInt(value)
  if (typeof value === "string") {
    try {
      return BigInt(value)
    } catch {
      return null
    }
  }
  return null
}

export function parseFixedDecimal(value: string, decimals: number): bigint | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null

  const [wholeRaw, fracRaw = ""] = trimmed.split(".")
  if (fracRaw.length > decimals) return null

  const scale = 10n ** BigInt(decimals)
  const whole = BigInt(wholeRaw || "0")
  const frac = BigInt((fracRaw || "").padEnd(decimals, "0") || "0")
  return whole * scale + frac
}

export function formatFixedDecimal(amount: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals)
  const whole = amount / scale
  const frac = amount % scale
  const fracString = frac
    .toString(10)
    .padStart(decimals, "0")
    .replace(/0+$/, "")

  return fracString ? `${whole.toString(10)}.${fracString}` : whole.toString(10)
}

export function formatUnknown(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number") return `${value}`
  if (typeof value === "bigint") return value.toString(10)
  return "Unknown"
}

export function formatAddress(value: string): string {
  if (value.length <= 12) return value
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

export function formatSignedFixedDecimal(amount: bigint, decimals: number): string {
  const sign = amount < 0n ? "-" : ""
  const absoluteAmount = amount < 0n ? -amount : amount
  return `${sign}${formatFixedDecimal(absoluteAmount, decimals)}`
}

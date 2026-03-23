"use node"

export interface PythOraclePrice1e6 {
  price: bigint
  conf: bigint
  postedSlot: bigint
}

function readU64LE(bytes: Uint8Array, offset: number): bigint {
  let value = 0n
  for (let i = 0; i < 8; i++) {
    value |= BigInt(bytes[offset + i] ?? 0) << (8n * BigInt(i))
  }
  return value
}

function readI64LE(bytes: Uint8Array, offset: number): bigint {
  return BigInt.asIntN(64, readU64LE(bytes, offset))
}

function readI32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  )
}

function pow10(exp: number): bigint {
  let v = 1n
  for (let i = 0; i < exp; i++) v *= 10n
  return v
}

export function getOraclePrice1e6FromPriceUpdateV2Bytes(
  bytes: Uint8Array,
): PythOraclePrice1e6 | null {
  if (bytes.length < 8 + 32 + 1) return null

  let cursor = 8 + 32
  const verificationLevel = bytes[cursor] ?? 255
  cursor += 1

  // borsh enum VerificationLevel: Partial { num_signatures: u8 } | Full
  if (verificationLevel === 0) cursor += 1
  else if (verificationLevel !== 1) return null

  const priceMessageLen = 32 + 8 + 8 + 4 + 8 + 8 + 8 + 8 + 8
  if (bytes.length < cursor + priceMessageLen) return null

  cursor += 32 // feed_id

  const price = readI64LE(bytes, cursor)
  cursor += 8
  const conf = readU64LE(bytes, cursor)
  cursor += 8
  const exponent = readI32LE(bytes, cursor)
  cursor += 4

  cursor += 8 + 8 + 8 + 8 // publish_time, prev_publish_time, ema_price, ema_conf
  const postedSlot = readU64LE(bytes, cursor)

  if (price <= 0n) return null

  const exp10 = exponent + 6
  const scale = pow10(Math.abs(exp10))
  const scaledPrice = exp10 >= 0 ? price * scale : price / scale
  const scaledConf = exp10 >= 0 ? conf * scale : conf / scale

  return { price: scaledPrice, conf: scaledConf, postedSlot }
}


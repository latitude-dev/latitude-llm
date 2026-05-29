import { createHash } from "node:crypto"

/**
 * Deterministic [0, 1) draw from a key. Two calls with the same key always return
 * the same value, so all spans sharing a key share the keep/drop decision.
 *
 * SHA-256's avalanche property makes its output bits uniform. We take the top 53
 * bits — the most a JS number can hold as an exact integer — and divide by 2^53,
 * so the BigInt → Number conversion is lossless and the draw is uniform in [0, 1).
 */
export function deterministicSample(key: string, rate: number): boolean {
  if (rate >= 1) return true
  if (rate <= 0) return false
  const digest = createHash("sha256").update(key).digest()
  const draw = Number(digest.readBigUInt64BE(0) >> 11n) / 2 ** 53
  return draw < rate
}

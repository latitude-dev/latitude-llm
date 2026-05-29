import { createHash } from "node:crypto"

/**
 * Deterministic [0, 1) draw from a key. Two calls with the same key always return
 * the same value, so all spans sharing a key share the keep/drop decision.
 *
 * SHA-256's avalanche property makes any 8 consecutive output bytes uniform over
 * [0, 2^64), so dividing by 2^64 yields a uniform float in [0, 1).
 */
export function deterministicSample(key: string, rate: number): boolean {
  if (rate >= 1) return true
  if (rate <= 0) return false
  const digest = createHash("sha256").update(key).digest()
  const high = digest.readBigUInt64BE(0)
  const draw = Number(high) / Number(1n << 64n)
  return draw < rate
}

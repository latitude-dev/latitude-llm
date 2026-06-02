import { type CryptoError, hash } from "@repo/utils"
import { Effect } from "effect"

/**
 * Deterministic [0, 1) draw from a key. Two calls with the same key always return
 * the same value, so all spans sharing a key share the keep/drop decision.
 *
 * SHA-256's avalanche property makes its output bits uniform. We take the top 53
 * bits — the most a JS number can hold as an exact integer — and divide by 2^53,
 * so the BigInt → Number conversion is lossless and the draw is uniform in [0, 1).
 */
export function deterministicSample(key: string, rate: number): Effect.Effect<boolean, CryptoError> {
  if (rate >= 1) return Effect.succeed(true)
  if (rate <= 0) return Effect.succeed(false)
  return Effect.map(hash(key), (digest) => {
    const top64Bits = BigInt(`0x${digest.slice(0, 16)}`)
    const draw = Number(top64Bits >> 11n) / 2 ** 53
    return draw < rate
  })
}

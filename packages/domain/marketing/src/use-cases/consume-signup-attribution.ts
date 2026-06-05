import { CacheStore } from "@domain/shared"
import { Effect } from "effect"
import { type MarketingAttribution, signupAttributionCacheKey } from "../signup-attribution.ts"

export interface ConsumeSignupAttributionInput {
  readonly email: string
}

const EMPTY: MarketingAttribution = {}

const safeParse = (raw: string): MarketingAttribution | null => {
  try {
    return JSON.parse(raw) as MarketingAttribution
  } catch {
    return null
  }
}

/**
 * Reads and clears the attribution stashed by `stashSignupAttribution`, returning
 * `{}` when it's absent or unreadable. Parses before deleting so a parse failure
 * leaves the key for a retry (it also self-expires via TTL). Best-effort: cache
 * errors are swallowed so signup is never blocked.
 */
export const consumeSignupAttribution = Effect.fn("marketing.consumeSignupAttribution")(function* (
  input: ConsumeSignupAttributionInput,
) {
  const cache = yield* CacheStore
  const key = signupAttributionCacheKey(input.email)

  const raw = yield* cache.get(key).pipe(Effect.catchTag("CacheError", () => Effect.succeed(null)))
  if (!raw) return EMPTY

  const parsed = safeParse(raw)
  if (parsed === null) return EMPTY

  yield* cache.delete(key).pipe(Effect.catchTag("CacheError", () => Effect.void))
  return parsed
})

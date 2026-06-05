import { CacheStore } from "@domain/shared"
import { Effect } from "effect"
import {
  SIGNUP_ATTRIBUTION_TTL_SECONDS,
  type SignupAttributionInput,
  signupAttributionCacheKey,
  toMarketingAttribution,
} from "../signup-attribution.ts"

export interface StashSignupAttributionInput {
  readonly email: string
  readonly attribution: SignupAttributionInput
}

/**
 * Stashes browser-captured signup attribution in the cache, keyed by email, so
 * `consumeSignupAttribution` can attach it to the `UserSignedUp` event when the
 * passwordless account is later created. No-op when there's nothing worth
 * forwarding; cache failures are swallowed (never block sending the magic link).
 */
export const stashSignupAttribution = Effect.fn("marketing.stashSignupAttribution")(function* (
  input: StashSignupAttributionInput,
) {
  const mapped = toMarketingAttribution(input.attribution)
  if (Object.keys(mapped).length === 0) return

  const cache = yield* CacheStore
  yield* cache
    .set(signupAttributionCacheKey(input.email), JSON.stringify(mapped), {
      ttlSeconds: SIGNUP_ATTRIBUTION_TTL_SECONDS,
    })
    .pipe(Effect.catchTag("CacheError", () => Effect.void))
})

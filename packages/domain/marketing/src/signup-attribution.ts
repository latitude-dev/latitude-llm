import { z } from "zod"

/**
 * PostHog property names spread verbatim onto the server-side `UserSignedUp`
 * capture by the analytics worker. `$session_id` links that event to the browser
 * session (unlocks `$entry_current_url`); UTM / click ids are the fallback when
 * the session can't be linked (e.g. a cross-device magic-link click).
 */
export type MarketingAttribution = {
  readonly $session_id?: string
  readonly $referrer?: string
  readonly utm_source?: string
  readonly utm_medium?: string
  readonly utm_campaign?: string
  readonly utm_term?: string
  readonly utm_content?: string
  readonly gclid?: string
  readonly fbclid?: string
  readonly ttclid?: string
  readonly li_fat_id?: string
  readonly msclkid?: string
}

/** Raw signup attribution captured in the browser; stored transiently in the cache.
 * The HTTP boundary (web `sendMagicLink`) validates with this same schema. */
export const signupAttributionInputSchema = z.object({
  sessionId: z.string().optional(),
  referrer: z.string().optional(),
  trackingParams: z.record(z.string(), z.string()).optional(),
})

export type SignupAttributionInput = z.infer<typeof signupAttributionInputSchema>

// Cache key for attribution stashed at magic-link request time and consumed when
// the (passwordless) account is created. Pre-org scope, so the `org:` key
// convention doesn't apply.
export const signupAttributionCacheKey = (email: string): string => `signup-attr:${email.toLowerCase()}`

// Comfortably outlasts the 1h magic-link window (create-better-auth.ts `expiresIn: 3600`).
export const SIGNUP_ATTRIBUTION_TTL_SECONDS = 60 * 120

// Params forwarded to PostHog (UTM / click ids); GTM-internal keys (`_gl`, `baker_*`) excluded.
const FORWARDED_PARAM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "ttclid",
  "li_fat_id",
  "msclkid",
] as const

/** Maps captured attribution to PostHog property names (spread verbatim onto the event). */
export const toMarketingAttribution = (input: SignupAttributionInput): MarketingAttribution => {
  const out: Record<string, string> = {}
  if (input.sessionId) out.$session_id = input.sessionId
  if (input.referrer) out.$referrer = input.referrer
  for (const key of FORWARDED_PARAM_KEYS) {
    const value = input.trackingParams?.[key]
    if (value) out[key] = value
  }
  return out
}

import type { MarketingAttribution } from "@domain/events"

// Signup is passwordless: the account is created in a later (maybe cross-device)
// request where `onUserCreated` has no request context. So stash browser
// attribution in Redis keyed by email at request time and read it back on create.
// Pre-org scope, so the `org:` key convention doesn't apply.
export const signupAttributionKey = (email: string): string => `signup-attr:${email.toLowerCase()}`

// Comfortably outlasts the 1h magic-link window (create-better-auth.ts `expiresIn: 3600`).
export const SIGNUP_ATTRIBUTION_TTL_SECONDS = 60 * 120

/** Raw attribution captured in the browser and stored verbatim as JSON in Redis. */
export interface SignupAttributionInput {
  readonly sessionId?: string
  readonly referrer?: string
  readonly trackingParams?: Record<string, string>
}

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

/** Maps stashed attribution to PostHog property names (spread verbatim onto the event). */
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

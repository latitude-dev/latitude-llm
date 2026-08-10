// Thin wrapper around posthog-js. Dynamically imports the SDK on first use so
// ~100KB of analytics code doesn't land in the initial bundle for login/signup
// routes. All functions are SSR-safe no-ops when called outside the browser or
// when VITE_LAT_POSTHOG_KEY is not configured.
//
// The two env vars are optional: in local dev and self-hosted setups without a
// PostHog project, we silently skip initialization.

import type { PostHog } from "posthog-js"

const POSTHOG_DEFAULT_HOST = "https://eu.i.posthog.com"
const INTERNAL_EMAIL_DOMAIN = "latitude.so"

interface PostHogEnv {
  readonly apiKey: string
  readonly host: string
}

const readEnv = (): PostHogEnv | null => {
  const apiKey = import.meta.env.VITE_LAT_POSTHOG_KEY
  if (!apiKey) return null
  const host = import.meta.env.VITE_LAT_POSTHOG_HOST ?? POSTHOG_DEFAULT_HOST
  return { apiKey, host }
}

export const isLatitudeStaffEmail = (email: string): boolean => {
  const host = email.trim().split("@").pop()?.toLowerCase()
  return host === INTERNAL_EMAIL_DOMAIN
}

// Module-level singletons. These are re-created across HMR module reloads,
// which is fine — PostHog's own __loaded guard prevents double-init on the
// underlying window object.
let instancePromise: Promise<PostHog | null> | null = null

const LAST_IDENTIFIED_KEY = "ph_last_identified_user"

const getLastIdentifiedUserId = (): string | null => {
  if (typeof window === "undefined") return null
  return sessionStorage.getItem(LAST_IDENTIFIED_KEY)
}

const setLastIdentifiedUserId = (id: string | null) => {
  if (typeof window === "undefined") return
  if (id) {
    sessionStorage.setItem(LAST_IDENTIFIED_KEY, id)
  } else {
    sessionStorage.removeItem(LAST_IDENTIFIED_KEY)
  }
}

const loadInstance = (): Promise<PostHog | null> => {
  if (typeof window === "undefined") return Promise.resolve(null)
  const env = readEnv()
  if (!env) return Promise.resolve(null)

  if (instancePromise) return instancePromise

  const promise: Promise<PostHog | null> = import("posthog-js")
    .then((mod) => {
      const posthog = mod.posthog
      posthog.init(env.apiKey, {
        api_host: env.host,
        cross_subdomain_cookie: true,
        // Per product decision: session recordings + autocapture + pageview.
        // Masking uses PostHog defaults (passwords + [data-ph-mask]).
        capture_pageview: true,
        autocapture: true,
        disable_session_recording: false,
        // Start silent — syncPostHogSession opts in for real customers once the authenticated layout mounts
        opt_out_capturing_by_default: true,
      })
      return posthog
    })
    .catch(() => {
      // Reset so the next call retries (e.g. transient chunk load failure
      // during a deploy). Silently return null so callers no-op.
      instancePromise = null
      return null
    })
  instancePromise = promise
  return promise
}

export const initPostHog = async (): Promise<void> => {
  await loadInstance()
}

const readPostHogSessionId = (posthog: PostHog): string | null => posthog.get_session_id() || null

/**
 * Ensures PostHog is loaded and a `$session_id` exists on unauthenticated routes
 * (login/signup) without opting real customers into product analytics. The id is
 * read from the cross-subdomain cookie when the visitor arrived from latitude.so.
 */
export const bootstrapPostHogAttributionSession = async (): Promise<void> => {
  const posthog = await loadInstance()
  if (!posthog) return
  readPostHogSessionId(posthog)
}

/**
 * Current PostHog session id, or null if the SDK isn't loaded / has no session.
 * Threaded onto the server-side `UserSignedUp` event as `$session_id` so PostHog
 * links it to the browser session. Best-effort.
 */
export const getPostHogSessionId = async (): Promise<string | null> => {
  const posthog = await loadInstance()
  if (!posthog) return null
  try {
    return readPostHogSessionId(posthog)
  } catch {
    return null
  }
}

const setPostHogCaptureEnabled = async (enabled: boolean): Promise<void> => {
  const posthog = await loadInstance()
  if (!posthog) return
  if (enabled) {
    posthog.opt_in_capturing()
  } else {
    posthog.opt_out_capturing()
  }
}

interface IdentifyUserInput {
  readonly id: string
  readonly email: string
  readonly name?: string | null
}

interface SyncSessionInput {
  readonly user: IdentifyUserInput
  readonly organizationId: string
  readonly organizationName?: string | null | undefined
  readonly organizationSlug?: string | null | undefined
  readonly organizationPlan?: string | null | undefined
  readonly excludeFromAnalytics: boolean
}

/**
 * Single entry-point for the authenticated layout to sync PostHog state.
 *
 * When the session is internal (staff email or impersonation), opt out of
 * capturing so no events, recordings, or person records are created. When
 * it's a real customer session, set identity + super properties + the active
 * org group, then opt in.
 *
 * Ordering matters: `register()` runs first so `organizationId` rides on every
 * subsequent event (including the opt-in event and first pageview). The org
 * group is then associated (without properties) BEFORE `opt_in_capturing()` —
 * `group()`'s `$groups` registration is an opt-out-agnostic persistence write,
 * so `$group_0` rides on the opt-in event and first pageview; the paired
 * `$groupidentify` capture is dropped while opted out, so org properties are
 * sent by a second `group()` call after opting in. `opt_in_capturing()` runs
 * BEFORE `identify()` — while opted out every capture() is dropped, so an
 * identify sent while opted out never transmits the `$identify` merge event,
 * orphaning the anonymous latitude.so visitor from the signed-up user. Opting
 * in first lets identify stitch the pre-signup landing session to the user.
 */
export const syncPostHogSession = async (input: SyncSessionInput): Promise<void> => {
  if (input.excludeFromAnalytics) {
    await setPostHogCaptureEnabled(false)
    return
  }

  const posthog = await loadInstance()
  if (!posthog) return

  const previousUserId = getLastIdentifiedUserId()
  const userChanged = !!(previousUserId && previousUserId !== input.user.id)
  setLastIdentifiedUserId(input.user.id)

  // reset() clears distinct_id, super properties, and groups — so it must run
  // before we re-establish them below.
  if (userChanged) {
    posthog.reset()
  }

  // Super property: attaches organizationId to every subsequent event,
  // including the opt-in event and first pageview fired below.
  posthog.register({ organizationId: input.organizationId })

  // Associate the org group BEFORE opting in so $group_0 rides on the opt-in
  // event and first pageview. $groups is a persistence write with no opt-out
  // gate; the paired $groupidentify capture is dropped while opted out, so
  // properties are sent by the second group() call once opted in below.
  posthog.group("organization", input.organizationId)

  // Opt in BEFORE identify. The SDK inits with opt_out_capturing_by_default,
  // so while opted out every capture() — including the $identify event that
  // merges the anonymous latitude.so visitor into this user — is silently
  // dropped. Opting in first lets identify actually transmit, so the pre-signup
  // landing session stitches to the identified user. register() above keeps
  // organizationId on the opt-in event and first pageview even though group()
  // runs after.
  posthog.opt_in_capturing()

  posthog.identify(input.user.id, {
    email: input.user.email,
    organizationId: input.organizationId,
    ...(input.user.name ? { name: input.user.name } : {}),
  })

  // Group properties power org-named cells in group-aggregated insights and
  // plan/slug breakdowns. Sent now (opted in) so the $groupidentify transmits;
  // the association itself was already set before opt-in above.
  const orgProps: Record<string, string> = {}
  if (input.organizationName) orgProps.name = input.organizationName
  if (input.organizationSlug) orgProps.slug = input.organizationSlug
  if (input.organizationPlan) orgProps.plan = input.organizationPlan
  if (Object.keys(orgProps).length > 0) {
    posthog.group("organization", input.organizationId, orgProps)
  }
}

/**
 * Clear the current identity and session. Called on explicit logout.
 *
 * Does NOT re-enable capturing — `opt_out_capturing_by_default: true` in the
 * init config keeps unauthenticated routes silent. The next authenticated
 * mount will call `syncPostHogSession`, which opts in for real customers.
 */
export const resetPostHog = async (): Promise<void> => {
  const posthog = await loadInstance()
  if (!posthog) return
  setLastIdentifiedUserId(null)
  posthog.reset()
}

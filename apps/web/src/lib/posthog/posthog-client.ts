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
 * Ordering matters: `opt_in_capturing()` fires the session's first `$pageview`,
 * so identify/register/group MUST run first. Otherwise that pageview (and any
 * autocapture before group() resolves) lands with `organizationId = None` and
 * no `$group_0`, which makes org-based retention / funnels / breakdowns read as
 * zero. `register()` is the belt-and-suspenders that keeps `organizationId` on
 * events even if they fire before `group()` takes effect.
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
  // including ones captured before group() is wired up.
  posthog.register({ organizationId: input.organizationId })

  posthog.identify(input.user.id, {
    email: input.user.email,
    organizationId: input.organizationId,
    ...(input.user.name ? { name: input.user.name } : {}),
  })

  // Group properties power org-named cells in group-aggregated insights and
  // plan/slug breakdowns. Only send keys we actually have.
  const orgProps: Record<string, string> = {}
  if (input.organizationName) orgProps.name = input.organizationName
  if (input.organizationSlug) orgProps.slug = input.organizationSlug
  if (input.organizationPlan) orgProps.plan = input.organizationPlan
  posthog.group("organization", input.organizationId, Object.keys(orgProps).length > 0 ? orgProps : undefined)

  // Opt in last so the implicit first pageview inherits identity + super
  // properties + the org group set above.
  posthog.opt_in_capturing()
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

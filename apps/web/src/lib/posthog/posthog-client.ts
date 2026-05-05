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
  readonly excludeFromAnalytics: boolean
}

/**
 * Single entry-point for the authenticated layout to sync PostHog state.
 *
 * When the session is internal (staff email or impersonation), opt out of
 * capturing so no events, recordings, or person records are created. When
 * it's a real customer session, opt in, handle user-change resets, and
 * call identify + group.
 */
export const syncPostHogSession = async (input: SyncSessionInput): Promise<void> => {
  if (input.excludeFromAnalytics) {
    await setPostHogCaptureEnabled(false)
    return
  }

  await setPostHogCaptureEnabled(true)

  const previousUserId = getLastIdentifiedUserId()
  const userChanged = !!(previousUserId && previousUserId !== input.user.id)
  setLastIdentifiedUserId(input.user.id)

  const posthog = await loadInstance()
  if (!posthog) return

  if (userChanged) {
    posthog.reset()
  }

  posthog.identify(input.user.id, {
    email: input.user.email,
    ...(input.user.name ? { name: input.user.name } : {}),
  })

  posthog.group(
    "organization",
    input.organizationId,
    input.organizationName ? { name: input.organizationName } : undefined,
  )
}

/**
 * Clear the current identity and session. Called on explicit logout.
 *
 * Re-enables capturing after reset so the next login starts from a neutral
 * baseline — `syncPostHogSession` will opt out again if the new user is staff.
 */
export const resetPostHog = async (): Promise<void> => {
  const posthog = await loadInstance()
  if (!posthog) return
  setLastIdentifiedUserId(null)
  posthog.reset()
  posthog.opt_in_capturing()
}

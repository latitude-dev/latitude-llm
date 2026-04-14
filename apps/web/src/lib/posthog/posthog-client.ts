// Thin wrapper around posthog-js. Dynamically imports the SDK on first use so
// ~100KB of analytics code doesn't land in the initial bundle for login/signup
// routes. All functions are SSR-safe no-ops when called outside the browser or
// when VITE_LAT_POSTHOG_KEY is not configured.
//
// The two env vars are optional: in local dev and self-hosted setups without a
// PostHog project, we silently skip initialization.

import type { PostHog } from "posthog-js"

const POSTHOG_DEFAULT_HOST = "https://eu.i.posthog.com"

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

// Module-level singletons. These are re-created across HMR module reloads,
// which is fine — PostHog's own __loaded guard prevents double-init on the
// underlying window object.
let instancePromise: Promise<PostHog | null> | null = null

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

interface IdentifyUserInput {
  readonly id: string
  readonly email: string
  readonly name?: string | null
}

export const identifyUser = async (input: IdentifyUserInput): Promise<void> => {
  const posthog = await loadInstance()
  if (!posthog) return
  posthog.identify(input.id, {
    email: input.email,
    ...(input.name ? { name: input.name } : {}),
  })
}

interface IdentifyOrganizationInput {
  readonly id: string
  readonly name?: string | null
}

export const identifyOrganization = async (input: IdentifyOrganizationInput): Promise<void> => {
  const posthog = await loadInstance()
  if (!posthog) return
  posthog.group("organization", input.id, input.name ? { name: input.name } : undefined)
}

/**
 * Clear the current identity. Call before identifying a new user (handled
 * automatically in the authenticated layout effect) and at explicit logout so
 * the previous user's session events don't bleed into the next one.
 */
export const resetPostHog = async (): Promise<void> => {
  const posthog = await loadInstance()
  if (!posthog) return
  posthog.reset()
}

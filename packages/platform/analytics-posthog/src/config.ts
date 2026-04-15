import { type InvalidEnvValueError, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

export const POSTHOG_DEFAULT_HOST = "https://eu.i.posthog.com"

export interface PostHogConfig {
  readonly apiKey: string
  readonly host: string
}

/**
 * Resolves PostHog config from env. Returns `undefined` when no API key is set
 * so the integration cleanly no-ops in local dev / self-hosted deployments that
 * don't use analytics.
 */
export const loadPostHogConfig: Effect.Effect<PostHogConfig | undefined, InvalidEnvValueError> = Effect.gen(
  function* () {
    const apiKey = yield* parseEnvOptional("LAT_POSTHOG_API_KEY", "string")
    if (!apiKey) return undefined

    const host = yield* parseEnvOptional("LAT_POSTHOG_HOST", "string")
    return { apiKey, host: host ?? POSTHOG_DEFAULT_HOST }
  },
)

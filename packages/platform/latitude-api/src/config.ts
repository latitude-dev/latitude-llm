import { type InvalidEnvValueError, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

/**
 * Production Latitude public API host. Used when `LAT_LATITUDE_API_URL` is
 * unset — matches the infra default (`infra/lib/ecs.ts`).
 */
export const LATITUDE_API_DEFAULT_URL = "https://api.latitude.so"

export interface LatitudeApiConfig {
  readonly apiKey: string
  readonly projectSlug: string
  readonly baseUrl: string
}

/**
 * Resolves the `@platform/latitude-api` config from env.
 *
 * Reuses `LAT_LATITUDE_TELEMETRY_API_KEY` and `LAT_LATITUDE_TELEMETRY_PROJECT_SLUG`
 * from the telemetry pipeline so product-feedback annotations land in the same
 * Latitude tenant the LLM spans were exported to — this is what makes the
 * `metadata.scoreId` trace-filter lookup resolve (see PRD: "Identity strategy").
 *
 * Returns `undefined` when any of the three envs is missing so the client cleanly
 * no-ops in environments that don't dogfood (local dev, CI). Mirrors the
 * `@platform/analytics-posthog` convention.
 *
 * Note: we deliberately do NOT read an organization id. The API key is already
 * scoped to one organization server-side, so path-level `:organizationId` is
 * redundant — that segment is being dropped from the public API in a follow-up
 * (along with a Fern SDK regeneration). See `client.ts` for the placeholder the
 * adapter passes until the regen lands.
 */
export const loadLatitudeApiConfig: Effect.Effect<LatitudeApiConfig | undefined, InvalidEnvValueError> = Effect.gen(
  function* () {
    const apiKey = yield* parseEnvOptional("LAT_LATITUDE_TELEMETRY_API_KEY", "string")
    if (!apiKey) return undefined

    const projectSlug = yield* parseEnvOptional("LAT_LATITUDE_TELEMETRY_PROJECT_SLUG", "string")
    if (!projectSlug) return undefined

    const baseUrl = yield* parseEnvOptional("LAT_LATITUDE_API_URL", "string")
    return { apiKey, projectSlug, baseUrl: baseUrl ?? LATITUDE_API_DEFAULT_URL }
  },
)

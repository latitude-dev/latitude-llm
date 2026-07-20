import { type InvalidEnvValueError, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"
import { BUNDLED_OSS_TELEMETRY_POSTHOG_API_KEY, OSS_TELEMETRY_POSTHOG_HOST } from "./constants.ts"

interface OssTelemetryConfig {
  readonly apiKey: string
  readonly host: string
}

export const isOssTelemetryEnabled = (): boolean => {
  const explicit = Effect.runSync(parseEnvOptional("LAT_OSS_TELEMETRY_ENABLED", "boolean"))
  if (explicit !== undefined) return explicit
  return process.env.NODE_ENV === "production"
}

export const loadOssTelemetryConfig: Effect.Effect<OssTelemetryConfig | undefined, InvalidEnvValueError> = Effect.gen(
  function* () {
    if (!isOssTelemetryEnabled()) return undefined

    const apiKey =
      (yield* parseEnvOptional("LAT_OSS_TELEMETRY_POSTHOG_API_KEY", "string")) ?? BUNDLED_OSS_TELEMETRY_POSTHOG_API_KEY
    if (!apiKey || apiKey === "phc_oss_telemetry_placeholder") return undefined

    const host = (yield* parseEnvOptional("LAT_OSS_TELEMETRY_POSTHOG_HOST", "string")) ?? OSS_TELEMETRY_POSTHOG_HOST
    return { apiKey, host }
  },
)

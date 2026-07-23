export const OSS_TELEMETRY_EVENT = "oss_deployment_heartbeat"

export const OSS_TELEMETRY_POSTHOG_HOST = "https://eu.i.posthog.com"

// Write-only PostHog project API key for anonymous OSS deployment telemetry.
// Override with LAT_OSS_TELEMETRY_POSTHOG_API_KEY for forks or staging variants.
export const BUNDLED_OSS_TELEMETRY_POSTHOG_API_KEY = "phc_oss_telemetry_placeholder"

export const OSS_TELEMETRY_HEARTBEAT_TTL_SECONDS = 24 * 60 * 60

export const ossTelemetryHeartbeatKey = (deploymentId: string): string => `oss-telemetry:heartbeat:${deploymentId}`

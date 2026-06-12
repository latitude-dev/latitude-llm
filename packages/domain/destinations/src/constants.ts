export const DESTINATION_INTERVAL_MS_MIN = 60_000
export const DESTINATION_INTERVAL_MS_MAX = 3_600_000
export const DESTINATION_INTERVAL_MS_DEFAULT = 300_000

export const DESTINATION_MAX_SPANS_PER_RUN_MIN = 1_000
export const DESTINATION_MAX_SPANS_PER_RUN_MAX = 50_000
export const DESTINATION_MAX_SPANS_PER_RUN_DEFAULT = 50_000

/** Consecutive terminal run failures before a destination is quarantined. */
export const DESTINATION_QUARANTINE_FAILURE_THRESHOLD = 5

/** Idle-backoff ceiling: a destination with only empty runs converges to one probe per hour. */
export const DESTINATION_IDLE_BACKOFF_MAX_MS = 3_600_000

export const POSTHOG_US_INGESTION_HOST = "https://us.i.posthog.com"
export const POSTHOG_EU_INGESTION_HOST = "https://eu.i.posthog.com"

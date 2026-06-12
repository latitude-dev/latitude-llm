export const POSTHOG_BATCH_PATH = "/batch/"

export const POSTHOG_BATCH_MAX_EVENTS = 500

/** PostHog's documented `/batch/` request-body limit (20 MB). */
export const POSTHOG_BATCH_MAX_BYTES = 20 * 1024 * 1024

/**
 * PostHog Cloud's effective per-event cap: Kafka's default 1 MB
 * message.max.bytes — capture 413s single events above it (posthog#23703);
 * undocumented in the capture API docs, so re-verify against a real project.
 */
export const POSTHOG_EVENT_MAX_BYTES = 1024 * 1024

/** PostHog requires `historical_migration` event timestamps to be at least 48h old. */
export const POSTHOG_HISTORICAL_MIGRATION_MIN_WINDOW_AGE_MS = 48 * 60 * 60 * 1000

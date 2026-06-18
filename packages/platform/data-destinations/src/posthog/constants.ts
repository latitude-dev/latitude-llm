export const POSTHOG_BATCH_PATH = "/batch/"

export const POSTHOG_FLAGS_PATH = "/flags/?v=2"

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

/**
 * In-transport 429 handling: honor PostHog's `Retry-After` and re-POST the same
 * chunk a few times before deferring to BullMQ, so a brief throttle doesn't fail
 * the whole window. Past the retry budget the chunk surfaces a retryable
 * `rate_limited` error — the engine backs off without quarantining the (healthy)
 * destination.
 */
export const POSTHOG_RATE_LIMIT_MAX_RETRIES = 3
export const POSTHOG_RATE_LIMIT_DEFAULT_BACKOFF_MS = 1_000
export const POSTHOG_RATE_LIMIT_MAX_BACKOFF_MS = 30_000

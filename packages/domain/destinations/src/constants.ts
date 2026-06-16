export const DESTINATION_INTERVAL_MS_MIN = 60_000
export const DESTINATION_INTERVAL_MS_MAX = 3_600_000
export const DESTINATION_INTERVAL_MS_DEFAULT = 300_000

export const DESTINATION_MAX_SPANS_PER_RUN_MIN = 1_000
export const DESTINATION_MAX_SPANS_PER_RUN_MAX = 50_000
export const DESTINATION_MAX_SPANS_PER_RUN_DEFAULT = 50_000

/** Consecutive terminal run failures before a destination is quarantined. */
export const DESTINATION_QUARANTINE_FAILURE_THRESHOLD = 5

/** Repeatable sweep: scheduler id (stable, replace-on-reboot) and every-minute cron. */
export const DESTINATION_SWEEPER_KEY = "destinations:sweep"
export const DESTINATION_SWEEPER_PATTERN = "* * * * *"

/** Sync-run audit rows are pruned once finished more than 30 days ago. */
export const DESTINATION_SYNC_RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Nightly prune of aged-out `destination_sync_runs`. Retention is coarse (30d),
 * so this runs once a day off-peak rather than on the every-minute sweep.
 */
export const DESTINATION_PRUNE_KEY = "destinations:prune"
export const DESTINATION_PRUNE_PATTERN = "30 3 * * *" // 3:30am UTC every day

/**
 * BullMQ retry budget for a `runSync` job. Exhausting it on a retryable failure
 * counts as one terminal failure toward {@link DESTINATION_QUARANTINE_FAILURE_THRESHOLD},
 * so a decommissioned host quarantines instead of retrying forever.
 */
export const DESTINATION_SYNC_MAX_ATTEMPTS = 5
export const DESTINATION_SYNC_RETRY_BACKOFF_MS = 30_000

/** Idle-backoff ceiling: a destination with only empty runs converges to one probe per hour. */
export const DESTINATION_IDLE_BACKOFF_MAX_MS = 3_600_000

/**
 * Window-end safety lag (5 min): the window ends at `now − SAFETY_LAG` so reads
 * see settled rows. Must cover both ReplacingMergeTree merge settling and
 * ingest-queue lag — a span that becomes visible behind the watermark is lost
 * to every destination, silently.
 */
export const DESTINATION_SAFETY_LAG_MS = 300_000

export const POSTHOG_US_INGESTION_HOST = "https://us.i.posthog.com"
export const POSTHOG_EU_INGESTION_HOST = "https://eu.i.posthog.com"

/** NEVER CHANGE THIS VALUE. UUIDv5 namespace for destination event identities — UUIDv5(RFC 4122 DNS namespace, "destinations.latitude.so"). Event UUIDs are the dedup identity at destinations: changing it re-identifies every already-delivered event, so retries and window re-runs would duplicate data in customers' systems. */
export const DESTINATION_EVENT_UUID_NAMESPACE = "c7696d7f-b92d-518a-9525-9c635f6367ce"

/** Default per-event ingestion size guard (1 MiB); the deliverer adapter owns the live vendor cap and passes it to the mapper. */
export const DESTINATION_MAX_EVENT_BYTES_DEFAULT = 1_048_576

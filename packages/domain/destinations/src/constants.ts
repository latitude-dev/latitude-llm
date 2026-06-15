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

/** Event name of the canary delivered by `testDestinationConnection`; named so customers can recognize it in their destination. */
export const DESTINATION_CONNECTION_TEST_EVENT_NAME = "latitude_connection_test"

export const DESTINATION_INTERVAL_MS_MIN = 60_000
export const DESTINATION_INTERVAL_MS_MAX = 3_600_000
export const DESTINATION_INTERVAL_MS_DEFAULT = 300_000

export const DESTINATION_MAX_RECORDS_PER_RUN_MIN = 1_000
export const DESTINATION_MAX_RECORDS_PER_RUN_MAX = 50_000
export const DESTINATION_MAX_RECORDS_PER_RUN_DEFAULT = 50_000

/**
 * Hard cap on records imported by a single backfill. A destination connected to
 * a months-old project (or resumed after months) could otherwise enqueue an
 * unbounded historical import; instead we backfill only the **most recent**
 * records up to this cap (the initiator raises the lower bound so the export
 * window holds at most this many, newest first). Deliberately an operational/
 * product bound on backfill duration + ClickHouse read volume — NOT a
 * PostHog-derived limit: PostHog exposes no rate limit on `/batch/` capture, so
 * there's no published throughput to size against. 1M ≈ 20 live-sync windows.
 */
export const DESTINATION_MAX_RECORDS_PER_BACKFILL = 1_000_000

/** Consecutive terminal run failures before a destination is quarantined. */
export const DESTINATION_QUARANTINE_FAILURE_THRESHOLD = 5

/** Repeatable sweep: scheduler id (stable, replace-on-reboot) and every-minute cron. */
export const DESTINATION_SWEEPER_KEY = "destinations:sweep"
export const DESTINATION_SWEEPER_PATTERN = "* * * * *"

/** Sync-run audit rows are pruned once finished more than 30 days ago. */
export const DESTINATION_SYNC_RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/**
 * A running backfill heartbeats (`backfill_started_at`/`updated_at`) every window
 * (~45s). If `backfill_started_at` is set but the heartbeat is older than this, the
 * chain wedged (lost job / crash) — treat it as not running so the UI frees up.
 */
export const DESTINATION_BACKFILL_STALE_MS = 5 * 60_000

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
 * Auto-pause threshold: after this many consecutive empty runs, the source's
 * destination is paused (`status = 'paused'`) so the sweep stops probing an
 * abandoned project forever. Idle backoff caps cadence at 1h after ~4 empty
 * runs, so 168 ≈ **7 days of continuous inactivity** regardless of the
 * configured interval. Resuming the destination grants a fresh idle budget (the
 * counter resets on pause), and resume's gap-backfill recovers anything within
 * retention — so no data is lost, it just needs a manual resume to flow again.
 */
export const DESTINATION_IDLE_PAUSE_AFTER_EMPTY_RUNS = 168

/**
 * Window-end safety lag (5 min): the window ends at `now − SAFETY_LAG` so reads
 * see settled rows. Must cover both ReplacingMergeTree merge settling and
 * ingest-queue lag — a span that becomes visible behind the watermark is lost
 * to every destination, silently.
 */
export const DESTINATION_SAFETY_LAG_MS = 300_000

/**
 * Lag threshold (now − cursor watermark) past which a destination is "behind"
 * rather than merely covering the safety lag. Two consumers:
 *   - the customer card flips its health badge `healthy → lagging`;
 *   - ops alarm P3-3 #1 ("destination stuck > X behind") fires off the per-run
 *     `lagMs` worker metric.
 * Set above the idle-backoff ceiling (60 min) + safety lag (5 min) so an
 * up-to-date but idle destination — whose empty runs keep its watermark at
 * `now − safetyLag` but whose cadence stretches to hourly — never trips it.
 * Only a genuine backlog (volume above the sustained-rate ceiling) drifts a
 * watermark past this and stays there.
 */
export const DESTINATION_LAG_WARNING_MS = 90 * 60_000

export const POSTHOG_US_INGESTION_HOST = "https://us.i.posthog.com"
export const POSTHOG_EU_INGESTION_HOST = "https://eu.i.posthog.com"

/** NEVER CHANGE THIS VALUE. UUIDv5 namespace for destination event identities — UUIDv5(RFC 4122 DNS namespace, "destinations.latitude.so"). Event UUIDs are the dedup identity at destinations: changing it re-identifies every already-delivered event, so retries and window re-runs would duplicate data in customers' systems. */
export const DESTINATION_EVENT_UUID_NAMESPACE = "c7696d7f-b92d-518a-9525-9c635f6367ce"

/** Default per-event ingestion size guard (1 MiB); the deliverer adapter owns the live vendor cap and passes it to the mapper. */
export const DESTINATION_MAX_EVENT_BYTES_DEFAULT = 1_048_576

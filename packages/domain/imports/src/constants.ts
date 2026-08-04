import type { ImportSource } from "./entities/import-source.ts"

const DAY_MS = 24 * 60 * 60 * 1000

export const IMPORT_DEFAULT_LOOKBACK_DAYS = 90
export const IMPORT_MAX_LOOKBACK_DAYS = 365
export const IMPORT_MIN_LOOKBACK_DAYS = 1

/**
 * Absolute ceiling on traces per import. In practice the org's remaining plan usage
 * binds long before this — an imported trace bills exactly like an ingested one — so
 * this exists to stop a single job from running for weeks, not to price it.
 */
export const IMPORT_HARD_MAX_TRACES = 1_000_000

export const IMPORT_WORKER_CONCURRENCY = 8

export const IMPORT_SOURCE_PAGE_SIZE = 1_000
export const IMPORT_SOURCE_PAGE_SIZE_MAX = 5_000

export const IMPORT_CLICKHOUSE_CHUNK_SIZE = 5_000

/**
 * The engine reads the range in windows that walk backwards from `rangeTo`, which is
 * what makes an import newest-first without depending on a source's sort parameter
 * (Langfuse has none). One day is the granularity at which a capped import truncates.
 * Empty windows widen up to the maximum so a sparse year does not cost 365 requests.
 */
export const IMPORT_WINDOW_BASE_MS = DAY_MS
export const IMPORT_WINDOW_MAX_MS = 32 * DAY_MS
export const IMPORT_WINDOW_GROWTH_FACTOR = 4

export const IMPORT_DRY_RUN_MAX_RECORDS = 5_000
export const IMPORT_DRY_RUN_TIMEOUT_MS = 30_000
/** Rows a single preview request pulls from a source, independent of the dry-run scan budget. */
export const IMPORT_PREVIEW_SAMPLE_LIMIT = 100
/** Normalized rows shown back to the user in the wizard's preview step. */
export const IMPORT_PREVIEW_SAMPLE_ROWS = 5

export const IMPORT_PAGE_TIMEOUT_MS = 120_000
export const IMPORT_MAX_ATTEMPTS = 5
export const IMPORT_RETRY_BACKOFF_MS = 10_000

/** Page runs kept on the job for post-mortem; older entries fall off the ring buffer. */
export const IMPORT_RUN_HISTORY_LIMIT = 25

export const IMPORT_SOURCE_PROJECT_LIST_LIMIT = 100
export const IMPORT_SOURCE_PROJECT_LIST_MAX = 500

export const IMPORT_RATE_LIMIT_PER_MIN: Record<ImportSource, number> = {
  langfuse: 60,
  langsmith: 12,
  braintrust: 60,
}

/**
 * Delay applied to each `fetchPage` re-enqueue. One import runs per org and its
 * page chain is serial, so spacing the publishes is what bounds the request rate
 * against a source to `IMPORT_RATE_LIMIT_PER_MIN` per org+source.
 */
export const sourceRequestIntervalMs = (source: ImportSource): number =>
  Math.ceil(60_000 / IMPORT_RATE_LIMIT_PER_MIN[source])

/** Bounds `Retry-After` waits so a permanently throttled source cannot chain pages forever. */
export const IMPORT_MAX_RATE_LIMIT_WAITS = 5
export const IMPORT_MAX_RETRY_AFTER_MS = 600_000

export const IMPORT_ID_NAMESPACE = "imports.latitude.so"

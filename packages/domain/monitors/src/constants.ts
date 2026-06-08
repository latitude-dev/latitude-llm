/**
 * The "current activity" window for `savedSearch.threshold` (multiplier mode) and
 * `savedSearch.match` evaluation. Equals the firing throttle interval — a shorter
 * window would be evaluated less often than it claims to measure.
 */
export const SAVED_SEARCH_CURRENT_WINDOW_MS = 5 * 60 * 1000

/**
 * Leading-edge throttle window for the per-project `checkSavedSearchMonitors` publish:
 * the first publish runs immediately, then at most one run per 5 min per project. Leading
 * (not trailing) so the check's trailing evaluation window still covers the traces that
 * triggered it — a `throttleMs` delay would slide that window 5 min past the burst.
 */
export const SAVED_SEARCH_MONITORS_THROTTLE_MS = 5 * 60 * 1000

/** Per-project `checkSavedSearchMonitors` dedupe key, shared by trace-end + the sweep so the two triggers coalesce into one throttled check stream. */
export const savedSearchMonitorsCheckDedupeKey = ({
  organizationId,
  projectId,
}: {
  readonly organizationId: string
  readonly projectId: string
}): string => `org:${organizationId}:monitors:check-saved-search:${projectId}`

/** BullMQ repeatable-job key for the saved-search sweep (re-registering with the same key replaces the schedule). */
export const SAVED_SEARCH_MONITORS_SWEEPER_KEY = "monitors:saved-search-sweep"

/** Sweep cron — every 5 minutes (the minimum escalating `window`; coarser would delay closes by more than a tick). */
export const SAVED_SEARCH_MONITORS_SWEEPER_PATTERN = "*/5 * * * *"

// ---------------------------------------------------------------------------
// `savedSearch.escalating` sustained-gate bucketing
// ---------------------------------------------------------------------------
//
// "Sustained for the whole `window`" is checked by tiling `[now - window, now]`
// into fixed-size sub-buckets and requiring (almost) every bucket to pass the
// per-bucket threshold. A one-shot spike inflates a single bucket and leaves the
// rest failing, so it's filtered; the same bucket count drives a prompt close
// once enough recent buckets go quiet. This is stateless — one bucketed query
// per check, no persisted timer.

/** Bucket width for a short sustained window (`window <= 15 min`): 1 minute. */
export const ESCALATING_BUCKET_SMALL_MS = 60 * 1000

/** Bucket width for a long sustained window (`window > 15 min`): 5 minutes. Keeps the bucket count bounded on long windows. */
export const ESCALATING_BUCKET_LARGE_MS = 5 * 60 * 1000

/** Cutoff between small (1-min) and large (5-min) buckets. */
export const ESCALATING_BUCKET_SIZE_CUTOFF_MS = 15 * 60 * 1000

/**
 * Fraction of buckets allowed to dip below the per-bucket threshold without
 * blocking an open (or forcing a close) — absorbs Poisson variance on a breach
 * sitting near the threshold. `0` = strict (every bucket must pass). The min-1
 * floor in {@link maxFailingBuckets} guarantees at least one bucket of slack for
 * any positive tolerance, so short windows still get slack.
 */
export const ESCALATING_BUCKET_FAIL_TOLERANCE = 0.1

/** Bucket width for a sustained window of `windowMs`: 1 min up to the cutoff, 5 min beyond. */
export const pickEscalatingBucketMs = (windowMs: number): number =>
  windowMs <= ESCALATING_BUCKET_SIZE_CUTOFF_MS ? ESCALATING_BUCKET_SMALL_MS : ESCALATING_BUCKET_LARGE_MS

/**
 * Buckets allowed to fail before the window is "not sustained": `floor(tolerance × N)`
 * with a floor of 1 bucket for any positive tolerance; `0` when tolerance is `0` (strict).
 * Symmetric across open (fewer-or-equal fails ⇒ open) and close (more fails ⇒ close).
 */
export const maxFailingBuckets = (bucketCount: number, tolerance: number = ESCALATING_BUCKET_FAIL_TOLERANCE): number =>
  tolerance <= 0 ? 0 : Math.max(1, Math.floor(tolerance * bucketCount))

/**
 * Buckets that fail the per-bucket threshold. An empty bucket (count `0`) always
 * fails — a gap means the breach wasn't sustained — even when the threshold
 * itself is `0` (e.g. a zero baseline in multiplier mode).
 */
export const countFailingBuckets = (bucketCounts: readonly number[], perBucketThreshold: number): number =>
  bucketCounts.filter((count) => count <= 0 || count < perBucketThreshold).length

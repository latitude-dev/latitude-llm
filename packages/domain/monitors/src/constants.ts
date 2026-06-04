/**
 * The "current activity" window for `savedSearch.threshold` (multiplier mode) and
 * `savedSearch.match` evaluation. Equals the firing throttle interval — a shorter
 * window would be evaluated less often than it claims to measure.
 */
export const SAVED_SEARCH_CURRENT_WINDOW_MS = 5 * 60 * 1000

/** Trace-end throttle for the per-project `checkSavedSearchMonitors` publish: at most one run per 5 min per project. */
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

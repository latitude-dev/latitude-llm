/**
 * How long one refresh publish suppresses the next, and how long the page waits for its result.
 *
 * One module because the two are a pair. A poll window shorter than the throttle ends with the page
 * telling the reader to refresh again at the one moment the queue is still dropping that publish,
 * so the advice it gives is false and the second wait is spent on nothing. Scoring runs reach
 * several minutes on large projects, so the poll has to outlive the throttle rather than the other
 * way round.
 */
export const AGENT_SCORE_REFRESH_THROTTLE_MS = 5 * 60_000

export const AGENT_SCORE_REFRESH_POLL_WINDOW_MS = AGENT_SCORE_REFRESH_THROTTLE_MS + 60_000

/** A short run lands in seconds and is worth watching closely; a long one is not worth the requests. */
export const AGENT_SCORE_REFRESH_POLL_INTERVAL_MS = 2_000
export const AGENT_SCORE_REFRESH_POLL_SETTLE_MS = 30_000
export const AGENT_SCORE_REFRESH_POLL_BACKOFF_MS = 10_000

/** The poll must outlive the publish throttle so a suggested retry can enqueue new work. */
export const AGENT_SCORE_REFRESH_THROTTLE_MS = 5 * 60_000

export const AGENT_SCORE_REFRESH_POLL_WINDOW_MS = AGENT_SCORE_REFRESH_THROTTLE_MS + 60_000

/** A short run lands in seconds and is worth watching closely; a long one is not worth the requests. */
export const AGENT_SCORE_REFRESH_POLL_INTERVAL_MS = 2_000
export const AGENT_SCORE_REFRESH_POLL_SETTLE_MS = 30_000
export const AGENT_SCORE_REFRESH_POLL_BACKOFF_MS = 10_000

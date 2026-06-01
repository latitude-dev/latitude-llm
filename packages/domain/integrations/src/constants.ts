/**
 * Token-rotation tuning constants. Slack rotated bot tokens live 12h
 * (`expires_in: 43200`); refresh happens on-demand before use.
 */

/**
 * Refresh-on-use threshold: if the active token expires within this
 * window (or already has), the next read refreshes it before use. The
 * skew also buffers against clock disagreement with Slack.
 */
export const SLACK_TOKEN_REFRESH_SKEW_SECONDS = 5 * 60

/**
 * TTL of the per-workspace single-flight refresh lock. Comfortably
 * exceeds a worst-case `oauth.v2.access` round-trip; the lock is also
 * released explicitly on completion, so the TTL is only a backstop.
 */
export const SLACK_REFRESH_LOCK_TTL_SECONDS = 60

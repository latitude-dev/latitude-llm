/**
 * Token-rotation tuning constants. Slack rotated bot tokens live 12h
 * (`expires_in: 43200`); these govern how early and how often we renew.
 */

/**
 * Refresh-on-use threshold: if the active token expires within this
 * window (or already has), the next read refreshes it before use.
 */
export const SLACK_TOKEN_REFRESH_SKEW_SECONDS = 5 * 60

/**
 * TTL of the per-workspace single-flight refresh lock. Comfortably
 * exceeds a worst-case `oauth.v2.access` round-trip; the lock is also
 * released explicitly on completion, so the TTL is only a backstop.
 */
export const SLACK_REFRESH_LOCK_TTL_SECONDS = 60

/**
 * The scheduled sweep refreshes integrations whose token expires within
 * this lookahead window. Larger than the cron interval so a token gets
 * several sweep attempts before it actually lapses.
 */
export const SLACK_TOKEN_REFRESH_LOOKAHEAD_SECONDS = 3 * 60 * 60

/** Repeatable-job scheduler id for the hourly refresh sweep. */
export const SLACK_TOKEN_REFRESH_SCAN_KEY = "slack:token-refresh-scan"

/** Cron pattern for the refresh sweep — hourly, on the hour. */
export const SLACK_TOKEN_REFRESH_SCAN_PATTERN = "0 * * * *"

import { Data } from "effect"

/**
 * Failure exchanging an OAuth authorization code against Slack's
 * `oauth.v2.access` endpoint. `slackError` holds Slack's documented error
 * string (e.g. `invalid_code`, `bad_redirect_uri`) when the API responded
 * with one; `cause` carries the underlying exception for transport-level
 * failures (network, JSON parse, unexpected response shape).
 */
export class SlackOAuthError extends Data.TaggedError("SlackOAuthError")<{
  readonly slackError?: string
  readonly cause?: unknown
}> {
  override get message() {
    return this.slackError ? `Slack OAuth exchange failed: ${this.slackError}` : "Slack OAuth exchange failed"
  }
}

/**
 * The inbound Slack webhook request did not pass HMAC signature
 * verification. `reason` distinguishes the failure mode so callers can log
 * or alert differently.
 */
export class InvalidSlackSignatureError extends Data.TaggedError("InvalidSlackSignatureError")<{
  readonly reason: "stale" | "format" | "mismatch"
}> {
  override get message() {
    return `Invalid Slack signature: ${this.reason}`
  }
}

/**
 * The Slack API rejected the request because the bot token is no
 * longer usable. `reason` matches the Slack-documented error string —
 * `invalid_auth` covers most cases, `token_expired` is specific to
 * rotated tokens that need refreshing (Phase 4).
 */
export class SlackAuthError extends Data.TaggedError("SlackAuthError")<{
  readonly reason: "invalid_auth" | "token_revoked" | "token_expired" | "account_inactive"
}> {
  override get message() {
    return `Slack auth rejected (${this.reason})`
  }
}

/**
 * Channel-level failure that does not retry: the channel is gone, the
 * bot is no longer a member, or the channel is archived. Caller should
 * treat this as a routing problem and surface it in the UI rather than
 * the worker retry loop.
 */
export class SlackChannelGoneError extends Data.TaggedError("SlackChannelGoneError")<{
  readonly reason: "channel_not_found" | "not_in_channel" | "is_archived" | "channel_is_private"
  readonly channelId?: string
}> {
  override get message() {
    return `Slack channel unreachable (${this.reason})`
  }
}

/**
 * Tier-2 rate-limit response. `retryAfterSec` reflects Slack's
 * `Retry-After` response header so the worker can honour it via
 * BullMQ's delayed retry rather than spinning.
 */
export class SlackRateLimitError extends Data.TaggedError("SlackRateLimitError")<{
  readonly retryAfterSec: number
}> {
  override get message() {
    return `Slack rate-limited: retry after ${this.retryAfterSec}s`
  }
}

/**
 * Catch-all for network failures, 5xx responses, malformed responses,
 * etc. The worker retries; the integration row stays put.
 */
export class SlackTransportError extends Data.TaggedError("SlackTransportError")<{
  readonly operation: string
  readonly cause?: unknown
}> {
  override get message() {
    return `Slack transport error during ${this.operation}`
  }
}

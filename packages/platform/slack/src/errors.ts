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

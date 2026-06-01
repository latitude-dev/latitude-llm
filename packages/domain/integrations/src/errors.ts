import { Data } from "effect"

/**
 * Raised when an install attempt collides with an existing active
 * integration owned by a different Latitude organization. The Slack
 * workspace can only be claimed by one Latitude org at a time — the
 * caller must soft-revoke the conflicting integration before retrying.
 */
export class SlackIntegrationConflictError extends Data.TaggedError("SlackIntegrationConflictError")<{
  readonly teamId: string
}> {
  readonly httpStatus = 409
  get httpMessage() {
    return "This Slack workspace is already connected to another Latitude organization"
  }
}

/**
 * A rotated bot-token refresh failed. `reason` distinguishes the
 * recoverable from the terminal:
 *  - `invalid_refresh_token` — the rotation chain is broken (Slack
 *    revoked the refresh token). Terminal: the integration must be
 *    reconnected; callers should not retry.
 *  - `transport` — network / 5xx / unexpected failure. Retryable.
 *  - `incomplete_response` — Slack returned `ok` but without the
 *    expected token fields. Treated as transport-ish (retryable).
 */
export class SlackTokenRefreshError extends Data.TaggedError("SlackTokenRefreshError")<{
  readonly reason: "invalid_refresh_token" | "transport" | "incomplete_response"
  readonly cause?: unknown
}> {
  override get message() {
    return `Slack token refresh failed (${this.reason})`
  }
}

/**
 * The per-workspace refresh lock was already held by another caller — a
 * concurrent refresh is in flight. Treated as a transient failure: the
 * web channel-list maps it to a retryable transport error, and the
 * notification worker propagates it so BullMQ retries — by which point
 * the other holder has finished refreshing and the next read sees the
 * fresh token.
 */
export class SlackRefreshLockUnavailableError extends Data.TaggedError("SlackRefreshLockUnavailableError")<{
  readonly organizationId: string
}> {
  override get message() {
    return "Slack token refresh already in progress for this organization"
  }
}

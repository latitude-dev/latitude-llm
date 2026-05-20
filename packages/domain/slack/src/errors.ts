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

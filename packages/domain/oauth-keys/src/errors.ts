import { Data } from "effect"

/**
 * Raised when revoking an OAuth key targets a `client_id` that doesn't
 * resolve under the caller's organization. Either the row doesn't exist
 * at all, or it belongs to a different org (in which case the RLS-aware
 * read returns no rows — same observable behaviour from this layer).
 *
 * Carries a 404 on the HTTP surface.
 */
export class OAuthApplicationNotFoundError extends Data.TaggedError("OAuthApplicationNotFoundError")<{
  readonly clientId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "OAuth application not found in this organization"
}

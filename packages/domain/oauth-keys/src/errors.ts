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

/**
 * Raised when a `(client_id, user_id)` pair doesn't resolve to a row
 * visible under the caller's organization — either the application
 * isn't here at all, no access tokens exist for that user, or the row
 * belongs to a different tenant (the RLS read collapses all three
 * cases into the same "not found" so we don't leak existence across
 * orgs).
 *
 * Carries a 404 on the HTTP surface.
 */
export class OAuthKeyNotFoundError extends Data.TaggedError("OAuthKeyNotFoundError")<{
  readonly clientId: string
  readonly userId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "OAuth key not found in this organization"
}

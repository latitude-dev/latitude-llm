import type { NotFoundError, RepositoryError, UserId } from "@domain/shared"
import { Effect } from "effect"
import { AdminUserRepository } from "./user-repository.ts"

export interface GetActiveSessionTokenInput {
  readonly userId: UserId
  readonly sessionId: string
}

/**
 * Resolve the Better Auth session token for an active session that
 * belongs to the given user. Used by the per-session Revoke flow on
 * the backoffice Sessions panel — see
 * `apps/web/src/domains/admin/users.functions.ts:adminRevokeUserSession`.
 *
 * The token is read **server-side at revoke time** rather than being
 * surfaced through the `AdminUserDetails` DTO. That keeps a live
 * authentication credential out of wire payloads, browser memory,
 * and consumer logs, and makes ownership verification a precondition
 * of finding the row at all (the repository's WHERE clause requires
 * a match on `(sessionId, userId, expiresAt > now())`).
 *
 * Fails with `NotFoundError` when the session id either doesn't
 * exist, belongs to a different user, or has already expired.
 */
export const getActiveSessionTokenUseCase = (
  input: GetActiveSessionTokenInput,
): Effect.Effect<string, NotFoundError | RepositoryError, AdminUserRepository> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("admin.targetUserId", input.userId)
    yield* Effect.annotateCurrentSpan("admin.targetSessionId", input.sessionId)
    const repo = yield* AdminUserRepository
    return yield* repo.findActiveSessionTokenForUser(input.userId, input.sessionId)
  }).pipe(Effect.withSpan("admin.getActiveSessionToken"))

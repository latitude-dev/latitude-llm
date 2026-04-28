import type { NotFoundError, RepositoryError, UserId } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { AdminUserDetails } from "./user-details.ts"

/**
 * Cross-organization user-detail port for the backoffice.
 *
 * WARNING: adapters of this port MUST run under an admin (RLS-bypassing)
 * database connection — see `AdminUserRepositoryLive` in
 * `@platform/db-postgres`. This service is only ever wired into handlers
 * that have passed `requireAdminSession()` in `apps/web`.
 */
export class AdminUserRepository extends ServiceMap.Service<
  AdminUserRepository,
  {
    /**
     * Fetch a single user and their org memberships by id. Fails with
     * `NotFoundError` if no user exists — impersonation handlers depend
     * on this precondition.
     */
    findById(userId: UserId): Effect.Effect<AdminUserDetails, NotFoundError | RepositoryError>
    /**
     * Resolve the Better Auth session token for an **active** session
     * (`expires_at > now()`) that belongs to the given user. Used by
     * the per-session Revoke flow to look up the credential
     * server-side, so the token never has to round-trip through the
     * client. Fails with `NotFoundError` when no such session exists
     * — both "session id doesn't exist" and "session belongs to a
     * different user" collapse into the same error so a probing
     * caller can't distinguish the two.
     */
    findActiveSessionTokenForUser(
      userId: UserId,
      sessionId: string,
    ): Effect.Effect<string, NotFoundError | RepositoryError>
  }
>()("@domain/admin/AdminUserRepository") {}

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
  }
>()("@domain/admin/AdminUserRepository") {}

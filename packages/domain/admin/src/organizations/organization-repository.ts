import { type NotFoundError, type OrganizationId, type RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { AdminOrganizationDetails } from "./organization-details.ts"

/**
 * Cross-organization org-detail port for the backoffice.
 *
 * WARNING: adapters MUST run under an admin (RLS-bypassing) DB
 * connection — see `AdminOrganizationRepositoryLive` in
 * `@platform/db-postgres`. Only wired into handlers that have passed
 * `adminMiddleware` in `apps/web`.
 */
export class AdminOrganizationRepository extends ServiceMap.Service<
  AdminOrganizationRepository,
  {
    /**
     * Fetch an organisation, its members, and its (non-deleted)
     * projects in one call. Fails with `NotFoundError` when no org
     * exists.
     *
     * Members are returned with their per-org role AND their global
     * `users.role` (to surface platform-admins inside a tenant). Projects
     * exclude soft-deletes — same v1 policy as the project-detail page
     * and the search results.
     */
    findById(organizationId: OrganizationId): Effect.Effect<AdminOrganizationDetails, NotFoundError | RepositoryError>
  }
>()("@domain/admin/AdminOrganizationRepository") {}

import type { NotFoundError, OrganizationId, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { AdminOrganizationDetails } from "./organization-details.ts"

/**
 * Compact org summary keyed by id for the "organisations by usage" page.
 * Plan is the most recent active/trialing `subscriptions.plan` for the
 * org, or null when no such row exists.
 */
export interface AdminOrganizationSummary {
  readonly id: OrganizationId
  readonly name: string
  readonly slug: string
  readonly plan: string | null
  readonly memberCount: number
  readonly createdAt: Date
}

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

    /**
     * Hydrate a batch of organisations by id with member count and current
     * plan. Result is keyed by organisation id; ids missing from the
     * underlying table simply don't appear in the returned map — callers
     * decide how to react (the usage page silently drops them).
     */
    findManySummariesByIds(
      ids: readonly OrganizationId[],
    ): Effect.Effect<ReadonlyMap<OrganizationId, AdminOrganizationSummary>, RepositoryError>
  }
>()("@domain/admin/AdminOrganizationRepository") {}

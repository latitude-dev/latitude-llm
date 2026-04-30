import type { ApiKeyId, NotFoundError, OrganizationId, RepositoryError } from "@domain/shared"
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

    /**
     * Return the first non-deleted api-key id for the org, or `null` when
     * the org has none. Used by the "Create Demo Project" use-case to thread
     * the target org's existing default api key into the seed workflow so
     * ClickHouse spans reference a key that actually exists on the org —
     * not the canonical `SEED_API_KEY_ID` (which would only be valid on
     * the seed org). "First" is ordered by `createdAt asc` so the org's
     * default key (created at org-setup time via the `OrganizationCreated`
     * worker chain) wins; a nullable result lets the use-case fail loudly
     * for the degenerate "org with no api keys" case.
     */
    findFirstApiKeyId(organizationId: OrganizationId): Effect.Effect<ApiKeyId | null, RepositoryError>
  }
>()("@domain/admin/AdminOrganizationRepository") {}

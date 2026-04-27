import { type NotFoundError, type ProjectId, type RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { AdminProjectDetails } from "./project-details.ts"

/**
 * Cross-organization project-detail port for the backoffice.
 *
 * WARNING: adapters MUST run under an admin (RLS-bypassing) DB
 * connection — see `AdminProjectRepositoryLive` in
 * `@platform/db-postgres`. Only wired into handlers that have passed
 * `adminMiddleware` in `apps/web`.
 */
export class AdminProjectRepository extends ServiceMap.Service<
  AdminProjectRepository,
  {
    /**
     * Fetch a project + its parent organisation by id.
     *
     * Fails with `NotFoundError` when no project exists. Soft-deleted
     * projects are excluded — the backoffice deliberately does not
     * surface them in v1, matching the search-results filter.
     */
    findById(projectId: ProjectId): Effect.Effect<AdminProjectDetails, NotFoundError | RepositoryError>
  }
>()("@domain/admin/AdminProjectRepository") {}

import type { NotFoundError, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { AdminProjectTaxonomy } from "./taxonomy-result.ts"

/**
 * Cross-organization taxonomy read port for the backoffice.
 *
 * WARNING: adapters MUST run under an admin (RLS-bypassing) DB
 * connection — see `AdminTaxonomyRepositoryLive` in
 * `@platform/db-postgres`. Only wired into handlers that have passed
 * `adminMiddleware` in `apps/web`.
 */
export class AdminTaxonomyRepository extends Context.Service<
  AdminTaxonomyRepository,
  {
    /**
     * Fetch taxonomy categories and their child subcategories for a live project.
     *
     * Fails with `NotFoundError` when the project does not exist or is deleted.
     */
    getProjectTaxonomy(projectId: ProjectId): Effect.Effect<AdminProjectTaxonomy, NotFoundError | RepositoryError>
  }
>()("@domain/admin/AdminTaxonomyRepository") {}

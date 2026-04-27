import type { RepositoryError } from "@domain/shared"
import { type Effect, Context } from "effect"
import type { SearchEntityType, UnifiedSearchResult } from "./search-result.ts"

/**
 * Cross-organization search port for the backoffice.
 *
 * WARNING: adapters of this port MUST run under an admin (RLS-bypassing)
 * database connection — see {@link AdminSearchRepositoryLive} in
 * `@platform/db-postgres`. This service is only ever wired into handlers
 * that have passed `requireAdminSession()` in `apps/web`.
 */
export class AdminSearchRepository extends Context.Service<
  AdminSearchRepository,
  {
    /**
     * Run an `ilike` match across users / organizations / projects and return
     * up to 10 rows per entity. Caller is responsible for trimming / minimum
     * query length — enforced by the use-case.
     */
    unifiedSearch(query: string, entityType: SearchEntityType): Effect.Effect<UnifiedSearchResult, RepositoryError>
  }
>()("@domain/admin/AdminSearchRepository") {}

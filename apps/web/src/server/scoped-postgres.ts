import { withPostgres } from "@platform/db-postgres"
import type { Layer } from "effect"
import type { ScopedOrgId } from "./resolve-org-scope.ts"

/**
 * The org-scoped Postgres entry point for web read/write server functions in the
 * project-scoped domains. Identical to {@link withPostgres} except its org id is a
 * {@link ScopedOrgId} — a brand only {@link resolveOrgScope} can mint. Unlike
 * ClickHouse, Postgres has RLS, so this isn't a *security* boundary; it's a
 * *correctness* one: under a non-live scope (showcase/sandbox) the intended org
 * is NOT the session's, and passing the raw session org would silently read/write
 * the wrong tenant's data (RLS happily allows it — same viewer). Requiring the
 * brand makes "forgot to scope this" a compile error.
 *
 * Only the project-section domains (the surfaces the showcase renders) use this.
 * Settings/account/org/admin and other genuinely session- or cross-org-scoped
 * functions keep raw `withPostgres` (they never run under a non-live scope, or
 * resolve a non-session org deliberately).
 */
export const withScopedPostgres = <A, E, R>(
  layer: Layer.Layer<A, E, R>,
  client: Parameters<typeof withPostgres>[1],
  organizationId: ScopedOrgId,
) => withPostgres(layer, client, organizationId)

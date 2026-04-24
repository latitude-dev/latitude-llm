import type { Effect } from "effect"
import { ServiceMap } from "effect"
import type { RepositoryError } from "./errors.ts"
import type { OrganizationId } from "./id.ts"

/**
 * ChSqlClient provides ClickHouse database access.
 *
 * ClickHouse has no transaction or RLS support, so this is simpler
 * than the Postgres SqlClient. `transaction()` is a pass-through
 * and `query()` executes directly against the client.
 */
export interface ChSqlClientShape<X = unknown> {
  readonly organizationId: OrganizationId
  readonly transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  readonly query: <T>(
    fn: (client: X, organizationId: OrganizationId) => Promise<T>,
  ) => Effect.Effect<T, RepositoryError>
}

/**
 * ChSqlClient service - provides ClickHouse database access.
 *
 * @effect-leakable-service
 * ChSqlClient is a per-request/per-job scope dependency (analogous to
 * HttpServerRequest). Repository services resolve it per-method so the
 * organization context reflects the caller's scope, rather than being
 * captured once at Layer build time. Leaking this requirement through
 * service interfaces is intentional.
 */
export class ChSqlClient extends ServiceMap.Service<ChSqlClient, ChSqlClientShape>()("@domain/shared/ChSqlClient") {}

import { EffectService } from "@repo/effect-service"
import type { Effect } from "effect"
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

export class ChSqlClient extends EffectService<ChSqlClient, ChSqlClientShape>()("@domain/shared/ChSqlClient") {}

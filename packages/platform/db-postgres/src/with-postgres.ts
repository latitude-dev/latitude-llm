import type { OrganizationId, SqlClient } from "@domain/shared"
import { Layer } from "effect"
import type { PostgresClient } from "./client.ts"
import { SqlClientLive } from "./sql-client.ts"

/**
 * Bundle one or more Postgres repository layers with their SqlClient dependency.
 *
 * All repos share the same SqlClient instance, so `sqlClient.transaction()`
 * correctly wraps all repo operations in a single DB transaction.
 *
 * @example
 * ```ts
 * effect.pipe(
 *   Effect.provide(withPostgres(client, orgId, ProjectRepositoryLive, DatasetRepositoryLive)),
 * )
 * ```
 */
export const withPostgres = (
  client: PostgresClient,
  organizationId: OrganizationId,
  // biome-ignore lint/suspicious/noExplicitAny: Layer type variance requires any for repo union
  first: Layer.Layer<any, any, SqlClient>,
  // biome-ignore lint/suspicious/noExplicitAny: Layer type variance requires any for repo union
  ...rest: Layer.Layer<any, any, SqlClient>[]
) => Layer.mergeAll(first, ...rest).pipe(Layer.provideMerge(SqlClientLive(client, organizationId)))

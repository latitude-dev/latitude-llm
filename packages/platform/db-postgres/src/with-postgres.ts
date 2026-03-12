import { OrganizationId } from "@domain/shared"
import { Effect, Layer } from "effect"
import type { PostgresClient } from "./client.ts"
import { SqlClientLive } from "./sql-client.ts"

/**
 * Bundle one or more Postgres repository layers with their SqlClient dependency,
 * returning a pipe-compatible provider function.
 *
 * All repos share the same SqlClient instance, so `sqlClient.transaction()`
 * correctly wraps all repo operations in a single DB transaction.
 *
 * @example
 * ```ts
 * effect.pipe(
 *   withPostgres(Layer.mergeAll(ProjectRepositoryLive, DatasetRepositoryLive), client, orgId),
 * )
 * ```
 */
export const withPostgres = <A, E, R>(
  layer: Layer.Layer<A, E, R>,
  client: PostgresClient,
  organizationId: OrganizationId = OrganizationId("system"),
) => Effect.provide(layer.pipe(Layer.provideMerge(SqlClientLive(client, organizationId))))

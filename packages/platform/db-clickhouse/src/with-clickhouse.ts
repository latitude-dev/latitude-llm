import type { ClickHouseClient } from "@clickhouse/client"
import { OrganizationId, type OrganizationId as OrganizationIdType } from "@domain/shared"
import { Effect, Layer } from "effect"
import { ChSqlClientLive } from "./ch-sql-client.ts"

/**
 * Bundle one or more ClickHouse repository layers with their ChSqlClient dependency,
 * returning a pipe-compatible provider function.
 *
 * @example
 * ```ts
 * effect.pipe(
 *   withClickHouse(DatasetRowRepositoryLive, chClient, orgId),
 * )
 * ```
 */
export const withClickHouse = <A, E, R>(
  layer: Layer.Layer<A, E, R>,
  client: ClickHouseClient,
  organizationId: OrganizationIdType = OrganizationId("system"),
) => Effect.provide(layer.pipe(Layer.provideMerge(ChSqlClientLive(client, organizationId))))

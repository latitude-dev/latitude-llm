import type { ClickHouseClient } from "@clickhouse/client"
import type { ChSqlClient, OrganizationId } from "@domain/shared"
import { Layer } from "effect"
import { ChSqlClientLive } from "./ch-sql-client.ts"

/**
 * Bundle one or more ClickHouse repository layers with their ChSqlClient dependency.
 *
 * @example
 * ```ts
 * effect.pipe(
 *   Effect.provide(withClickHouse(chClient, orgId, DatasetRowRepositoryLive)),
 * )
 * ```
 */
export const withClickHouse = (
  client: ClickHouseClient,
  organizationId: OrganizationId,
  // biome-ignore lint/suspicious/noExplicitAny: Layer type variance requires any for repo union
  first: Layer.Layer<any, any, ChSqlClient>,
  // biome-ignore lint/suspicious/noExplicitAny: Layer type variance requires any for repo union
  ...rest: Layer.Layer<any, any, ChSqlClient>[]
) => Layer.mergeAll(first, ...rest).pipe(Layer.provideMerge(ChSqlClientLive(client, organizationId)))

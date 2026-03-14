import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape, type OrganizationId, toRepositoryError } from "@domain/shared"
import { Effect, Layer } from "effect"

export const ChSqlClientLive = (client: ClickHouseClient, organizationId: OrganizationId) =>
  Layer.succeed(ChSqlClient, {
    organizationId,
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    query: <T>(fn: (client: ClickHouseClient, organizationId: OrganizationId) => Promise<T>) =>
      Effect.tryPromise({
        try: () => fn(client, organizationId),
        catch: (error) => toRepositoryError(error, "query"),
      }),
  } satisfies ChSqlClientShape<ClickHouseClient>)

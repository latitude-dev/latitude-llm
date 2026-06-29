import type { ClickHouseClient } from "@clickhouse/client"
import {
  ChSqlClient,
  type ChSqlClientShape,
  causesIncludeConnectionReset,
  type OrganizationId,
  type RepositoryError,
  toRepositoryError,
} from "@domain/shared"
import { Effect, Layer, Schedule } from "effect"

// Keep-alive sockets are pooled and reused, but the server (or an intervening
// load balancer) closes idle ones on its own timeout. Reusing a socket in the
// race window after it was closed surfaces as `ECONNRESET` before the request
// reaches the server — transient and safe to retry. Two quick retries clear it
// without masking real outages; the small delay lets the stale socket be evicted.
const CONNECTION_RESET_RETRY_SCHEDULE = Schedule.addDelay(Schedule.recurs(2), () => Effect.succeed("50 millis"))

export const ChSqlClientLive = (client: ClickHouseClient, organizationId: OrganizationId) =>
  Layer.succeed(ChSqlClient, {
    organizationId,
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    query: <T>(fn: (client: ClickHouseClient, organizationId: OrganizationId) => Promise<T>) =>
      Effect.tryPromise({
        try: () => fn(client, organizationId),
        catch: (error) => toRepositoryError(error, "query"),
      }).pipe(
        Effect.retry({
          while: (error: RepositoryError) => causesIncludeConnectionReset(error),
          schedule: CONNECTION_RESET_RETRY_SCHEDULE,
        }),
      ),
  } satisfies ChSqlClientShape<ClickHouseClient>)

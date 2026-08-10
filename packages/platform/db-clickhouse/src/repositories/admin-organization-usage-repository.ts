import type { ClickHouseClient } from "@clickhouse/client"
import { AdminOrganizationUsageRepository, type AdminOrganizationUsageRow } from "@domain/admin"
import { ChSqlClient, type ChSqlClientShape, OrganizationId, toRepositoryError } from "@domain/shared"
import { parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"

/**
 * Live layer for the backoffice "organisations by usage" CH port.
 *
 * ⚠️ SECURITY: cross-organisation by design — the query aggregates
 * `traces` over every organisation in the cluster. Only safe to wire
 * into handlers that have already passed `adminMiddleware`. Never
 * provide alongside per-tenant CH repositories on customer-facing
 * paths.
 *
 * Used to enrich the Postgres credit-spend ranking with rolling-window
 * trace counts. `min_start_time` is the partition key (PARTITION BY
 * toYYYYMM(...)) and carries a minmax skip index, so the WHERE on it
 * prunes partitions and granules cheaply. Inner GROUP BY collapses
 * partial rows that AggregatingMergeTree may not have merged yet (same
 * discipline as `LIST_SELECT` in `trace-repository`); the outer
 * aggregation then counts traces and picks the most recent end time
 * per organisation.
 *
 * Bound DateTime64 params reject `toISOString()`'s trailing `Z`, so
 * this query normalises to `YYYY-MM-DD HH:MM:SS.sss`.
 */
export const AdminOrganizationUsageRepositoryLive = Layer.effect(
  AdminOrganizationUsageRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    return {
      findManyByOrganizationIds: ({ organizationIds, since }) => {
        if (organizationIds.length === 0) {
          return Effect.succeed(new Map<OrganizationId, AdminOrganizationUsageRow>())
        }

        return chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT
                        organization_id,
                        count() AS trace_count,
                        max(end_time) AS last_trace_at
                      FROM (
                        SELECT
                          organization_id,
                          project_id,
                          trace_id,
                          max(max_end_time) AS end_time
                        FROM traces
                        WHERE min_start_time >= {since:DateTime64(9, 'UTC')}
                          AND organization_id IN {organizationIds:Array(String)}
                        GROUP BY organization_id, project_id, trace_id
                      )
                      GROUP BY organization_id`,
              query_params: {
                since: since.toISOString().replace("T", " ").replace("Z", ""),
                organizationIds: organizationIds as readonly string[],
              },
              format: "JSONEachRow",
            })
            return result.json<{
              organization_id: string
              trace_count: string
              last_trace_at: string
            }>()
          })
          .pipe(
            Effect.map((rows) => {
              const result = new Map<OrganizationId, AdminOrganizationUsageRow>()
              for (const row of rows) {
                const organizationId = OrganizationId(row.organization_id)
                result.set(organizationId, {
                  organizationId,
                  traceCount: Number(row.trace_count),
                  lastTraceAt: row.last_trace_at ? parseCHDate(row.last_trace_at) : null,
                })
              }
              return result
            }),
            Effect.mapError((error) => toRepositoryError(error, "findManyByOrganizationIds")),
          )
      },
    }
  }),
)

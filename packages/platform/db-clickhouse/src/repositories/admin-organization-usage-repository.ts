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
 * Sort key is `trace_count DESC, organization_id ASC`. The mixed
 * directions mean the cursor predicate cannot use plain tuple
 * comparison — it expands to "trace_count smaller OR (same count AND
 * id larger)" so the page is strictly monotone with the ORDER BY.
 *
 * `min_start_time` is the partition key (PARTITION BY toYYYYMM(...))
 * and carries a minmax skip index, so the WHERE on it prunes
 * partitions and granules cheaply for the rolling window. Inner
 * GROUP BY collapses partial rows that AggregatingMergeTree may not
 * have merged yet (same discipline as `LIST_SELECT` in
 * `trace-repository`); the outer aggregation then counts traces and
 * picks the most recent end time per organisation.
 *
 * Bound DateTime64 params reject `toISOString()`'s trailing `Z` —
 * we normalise to `YYYY-MM-DD HH:MM:SS.sss` (same shape used by
 * `mapDateTime64UtcQueryParam` in the trace-fields registry).
 */
export const AdminOrganizationUsageRepositoryLive = Layer.effect(
  AdminOrganizationUsageRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    return {
      listByTraceCount: ({ since, cursor, limit }) =>
        chSqlClient
          .query(async (client) => {
            const cursorClause = cursor
              ? `HAVING (trace_count < {cursorTraceCount:UInt64})
                       OR (trace_count = {cursorTraceCount:UInt64}
                           AND organization_id > {cursorOrganizationId:String})`
              : ""

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
                        GROUP BY organization_id, project_id, trace_id
                      )
                      GROUP BY organization_id
                      ${cursorClause}
                      ORDER BY trace_count DESC, organization_id ASC
                      LIMIT {limit:UInt32}`,
              query_params: {
                since: since.toISOString().replace("T", " ").replace("Z", ""),
                limit: limit + 1,
                ...(cursor
                  ? {
                      cursorTraceCount: cursor.traceCount,
                      cursorOrganizationId: cursor.organizationId,
                    }
                  : {}),
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
              const hasMore = rows.length > limit
              const pageRows = hasMore ? rows.slice(0, limit) : rows
              const items: AdminOrganizationUsageRow[] = pageRows.map((row) => ({
                organizationId: OrganizationId(row.organization_id),
                traceCount: Number(row.trace_count),
                lastTraceAt: row.last_trace_at ? parseCHDate(row.last_trace_at) : null,
              }))
              return { rows: items, hasMore }
            }),
            Effect.mapError((error) => toRepositoryError(error, "listByTraceCount")),
          ),
    }
  }),
)

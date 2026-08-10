import type { ClickHouseClient } from "@clickhouse/client"
import { AdminUnpricedSpanRepository, type AdminUnpricedSpanSlice } from "@domain/admin"
import { ChSqlClient, type ChSqlClientShape, OrganizationId, ProjectId, toRepositoryError } from "@domain/shared"
import { parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"
import { USAGE_OPERATIONS_SQL } from "../metric-sql/helpers.ts"

/**
 * Live layer for the backoffice unpriced-spans port.
 *
 * ⚠️ SECURITY: cross-organisation by design — the query scans `spans` over every organisation in
 * the cluster. Only safe to wire into handlers that have already passed `adminMiddleware`. Never
 * provide alongside per-tenant CH repositories on customer-facing paths.
 *
 * `cost_source = 'unpriced'` is read literally rather than re-derived from a zero cost: rows
 * written before the column existed read back blank, and a blank zero cannot distinguish unpriced
 * usage from genuinely free usage. `start_time` is the partition key and carries a minmax skip
 * index, so the window prunes partitions cheaply. No dedup by `span_id` — same convention as the
 * other span aggregates.
 */
export const AdminUnpricedSpanRepositoryLive = Layer.effect(
  AdminUnpricedSpanRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    return {
      listUnpricedSlices: ({ since }) =>
        chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT
                        organization_id,
                        project_id,
                        provider,
                        model,
                        count() AS spans,
                        sum(tokens_total) AS tokens,
                        min(start_time) AS first_seen_at,
                        max(start_time) AS last_occurrence_at
                      FROM spans
                      WHERE start_time >= {since:DateTime64(9, 'UTC')}
                        AND cost_source = 'unpriced'
                        AND operation IN ${USAGE_OPERATIONS_SQL}
                      GROUP BY organization_id, project_id, provider, model`,
              // Bound DateTime64 params reject `toISOString()`'s trailing `Z`.
              query_params: { since: since.toISOString().replace("T", " ").replace("Z", "") },
              format: "JSONEachRow",
            })
            return result.json<{
              organization_id: string
              project_id: string
              provider: string
              model: string
              spans: string
              tokens: string
              first_seen_at: string
              last_occurrence_at: string
            }>()
          })
          .pipe(
            Effect.map((rows): readonly AdminUnpricedSpanSlice[] =>
              rows.map((row) => ({
                organizationId: OrganizationId(row.organization_id),
                projectId: ProjectId(row.project_id),
                provider: row.provider,
                model: row.model,
                spans: Number(row.spans),
                tokens: Number(row.tokens),
                firstSeenAt: parseCHDate(row.first_seen_at),
                lastOccurrenceAt: parseCHDate(row.last_occurrence_at),
              })),
            ),
            Effect.mapError((error) => toRepositoryError(error, "listUnpricedSlices")),
          ),
    }
  }),
)

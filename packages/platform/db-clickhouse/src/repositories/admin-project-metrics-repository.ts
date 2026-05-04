import type { ClickHouseClient } from "@clickhouse/client"
import {
  AdminProjectMetricsRepository,
  type ProjectAnnotationBucket,
  type ProjectMetricCountBucket,
  type ProjectTopIssueOccurrence,
} from "@domain/admin"
import { ChSqlClient, type ChSqlClientShape, IssueId, toRepositoryError } from "@domain/shared"
import { parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"

/**
 * Live layer for the backoffice "project metrics over time" CH port.
 *
 * ⚠️ SECURITY: cross-organisation by design — these queries aggregate
 * `traces` and `scores` filtered by `(organization_id, project_id)`
 * but the CH client is a single shared admin connection with no ACL.
 * Only safe to wire into handlers that have already passed
 * `adminMiddleware`.
 *
 * `traces` patterns mirror `TraceRepository.histogramByProjectId` —
 * inner `GROUP BY org/project/trace_id` to collapse partial rows from
 * the AggregatingMergeTree, outer bucket aggregation. `scores` is a
 * plain MergeTree, no partial-row reconciliation needed.
 *
 * Bound `DateTime64` parameters reject `toISOString()`'s trailing `Z` —
 * we normalise to `YYYY-MM-DD HH:MM:SS.sss` (same shape used elsewhere
 * in this package; see `mapDateTime64UtcQueryParam`). Note: scores
 * uses precision 3, traces uses precision 9.
 */
export const AdminProjectMetricsRepositoryLive = Layer.effect(
  AdminProjectMetricsRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    const formatDateTime64 = (value: Date): string => value.toISOString().replace("T", " ").replace("Z", "")

    return {
      getTraceHistogram: ({ organizationId, projectId, since, bucketSeconds }) =>
        chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT
                        toDateTime(
                          intDiv(toUnixTimestamp(start_time), {bucketSeconds:UInt32}) * {bucketSeconds:UInt32},
                          'UTC'
                        ) AS bucket_start,
                        count() AS count
                      FROM (
                        SELECT
                          organization_id,
                          project_id,
                          trace_id,
                          min(min_start_time) AS start_time
                        FROM traces
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND min_start_time >= {since:DateTime64(9, 'UTC')}
                        GROUP BY organization_id, project_id, trace_id
                      )
                      GROUP BY bucket_start
                      ORDER BY bucket_start ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                since: formatDateTime64(since),
                bucketSeconds: Math.floor(bucketSeconds),
              },
              format: "JSONEachRow",
            })
            return result.json<{ bucket_start: string; count: string }>()
          })
          .pipe(
            Effect.map((rows): readonly ProjectMetricCountBucket[] =>
              rows.map((row) => ({ bucketStart: parseCHDate(row.bucket_start), count: Number(row.count) })),
            ),
            Effect.mapError((error) => toRepositoryError(error, "getTraceHistogram")),
          ),

      getAnnotationHistogram: ({ organizationId, projectId, since, bucketSeconds }) =>
        chSqlClient
          .query(async (client) => {
            // Split annotations by `passed`. `countIf(passed)` counts
            // rows where the score passed; `countIf(NOT passed)` covers
            // both failed and errored scores — the score entity treats
            // "errored" as a sub-flavour of `passed=false`, not a third
            // outcome, so the binary split matches the domain model.
            const result = await client.query({
              query: `SELECT
                        toDateTime(
                          intDiv(toUnixTimestamp(created_at), {bucketSeconds:UInt32}) * {bucketSeconds:UInt32},
                          'UTC'
                        ) AS bucket_start,
                        countIf(passed)     AS passed_count,
                        countIf(NOT passed) AS failed_count
                      FROM scores
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND source = 'annotation'
                        AND created_at >= {since:DateTime64(3, 'UTC')}
                      GROUP BY bucket_start
                      ORDER BY bucket_start ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                since: formatDateTime64(since),
                bucketSeconds: Math.floor(bucketSeconds),
              },
              format: "JSONEachRow",
            })
            return result.json<{ bucket_start: string; passed_count: string; failed_count: string }>()
          })
          .pipe(
            Effect.map((rows): readonly ProjectAnnotationBucket[] =>
              rows.map((row) => ({
                bucketStart: parseCHDate(row.bucket_start),
                passedCount: Number(row.passed_count),
                failedCount: Number(row.failed_count),
              })),
            ),
            Effect.mapError((error) => toRepositoryError(error, "getAnnotationHistogram")),
          ),

      getTopIssuesByOccurrences: ({ organizationId, projectId, since, limit }) =>
        chSqlClient
          .query(async (client) => {
            // Mirrors `score-analytics-repository.listIssueWindowMetrics`
            // shape — same WHERE, same GROUP BY — with the `issue_id != ''`
            // filter and a LIMIT. Excludes the empty sentinel that
            // appears for scores not bound to an issue.
            const result = await client.query({
              query: `SELECT
                        issue_id,
                        count()         AS occurrences,
                        max(created_at) AS last_seen_at
                      FROM scores
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND issue_id != ''
                        AND created_at >= {since:DateTime64(3, 'UTC')}
                      GROUP BY issue_id
                      ORDER BY occurrences DESC, issue_id ASC
                      LIMIT {limit:UInt32}`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                since: formatDateTime64(since),
                limit: Math.floor(limit),
              },
              format: "JSONEachRow",
            })
            return result.json<{ issue_id: string; occurrences: string; last_seen_at: string }>()
          })
          .pipe(
            Effect.map((rows): readonly ProjectTopIssueOccurrence[] =>
              rows.map((row) => ({
                issueId: IssueId(row.issue_id),
                occurrences: Number(row.occurrences),
                lastSeenAt: parseCHDate(row.last_seen_at),
              })),
            ),
            Effect.mapError((error) => toRepositoryError(error, "getTopIssuesByOccurrences")),
          ),
    }
  }),
)

import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape, TraceId, toRepositoryError } from "@domain/shared"
import {
  type ClusterAnalysisAggregate,
  type ClusterRepresentativeExample,
  TaxonomyClusterIntelligenceRepository,
} from "@domain/taxonomy"
import { Effect, Layer } from "effect"

const toClickhouseDateTime = (date: Date): string => date.toISOString().replace("Z", "")

const behaviourSessionFilterSql = `
  ({filter:String} = 'all'
    OR ({filter:String} = 'resolution' AND has(momentKinds, 'resolution'))
    OR ({filter:String} = 'abandonment' AND has(momentKinds, 'abandonment'))
    OR ({filter:String} NOT IN ('all', 'resolution', 'abandonment') AND has(momentKinds, {filter:String})))
`

const behaviourMetricMomentSql = `
  (({momentMetric:String} = 'frequency' AND m.kind != '')
    OR ({momentMetric:String} = 'escalation' AND m.kind = 'escalation')
    OR ({momentMetric:String} = 'resolution' AND m.kind = 'resolution')
    OR ({momentMetric:String} = 'churnRisk' AND m.kind IN ('abandonment', 'user_frustration'))
    OR ({momentMetric:String} = 'wins' AND m.kind IN ('resolution', 'user_satisfaction')))
`

const behaviourMomentRangeSql = `
  ${behaviourMetricMomentSql}
  AND m.first_message_index >= {turnFrom:UInt16}
  AND m.first_message_index <= {turnTo:UInt16}
`

// Observations are pinned to each session's CURRENT analysis: superseded
// analysis generations are never deleted, so an unscoped read unions every
// re-analysis and `any(analysis_hash)` could pick a stale hash, breaking the
// trace link and silently dropping every moment label.
const behaviourClusterSessionsCte = (timeFromClause: string, timeToClause: string, hasMomentRange: boolean) => `
  WITH latest_analyses AS (
    SELECT organization_id, project_id, session_id, analysis_hash, trace_ids
    FROM session_analyses FINAL
    WHERE organization_id = {organizationId:String}
      AND project_id = {projectId:String}
  ),
  cluster_sessions AS (
    SELECT
      o.organization_id AS organization_id,
      o.project_id AS project_id,
      o.session_id AS session_id,
      any(a.analysis_hash) AS analysisHash,
      arrayElement(any(a.trace_ids), 1) AS traceId,
      min(o.start_time) AS startTime,
      max(o.end_time) AS endTime
    FROM taxonomy_observations AS o FINAL
    INNER JOIN latest_analyses AS a
      ON o.organization_id = a.organization_id
     AND o.project_id = a.project_id
     AND o.session_id = a.session_id
     AND o.analysis_hash = a.analysis_hash
    WHERE o.organization_id = {organizationId:String}
      AND o.project_id = {projectId:String}
      AND o.assigned_cluster_id IN {clusterIds:Array(String)}
      ${timeFromClause}
      ${timeToClause}
    GROUP BY o.organization_id, o.project_id, o.session_id
  ),
  enriched_sessions AS (
    SELECT
      cs.session_id AS sessionId,
      any(cs.traceId) AS traceId,
      any(cs.endTime) AS endTime,
      ${hasMomentRange ? `countIf(${behaviourMomentRangeSql})` : "toUInt64(0)"} AS selectedMomentCount,
      groupUniqArrayIf(m.kind, m.kind != '') AS momentKinds
    FROM cluster_sessions AS cs
    LEFT JOIN session_moment_labels AS m FINAL
      ON cs.organization_id = m.organization_id
     AND cs.project_id = m.project_id
     AND cs.session_id = m.session_id
     AND cs.analysisHash = m.analysis_hash
    GROUP BY cs.session_id
  )
`

type DistributionRow = {
  readonly key: string
  readonly count: number
}

type AggregateRow = {
  readonly source_observation_count: number
  readonly source_session_count: number
  readonly source_analysis_count: number
  readonly eligible_session_count: number
  readonly skipped_count: number
  readonly failed_count: number
}

type ExampleRow = {
  readonly session_id: string
  readonly summary: string
}

const distributionFromRows = (rows: readonly DistributionRow[]) =>
  Object.fromEntries(rows.filter((row) => row.key.length > 0).map((row) => [row.key, row.count]))

export const TaxonomyClusterIntelligenceRepositoryLive = Layer.effect(
  TaxonomyClusterIntelligenceRepository,
  Effect.gen(function* () {
    return {
      getClusterAggregate: ({ organizationId, projectId, clusterIds, sourceWindowStart, sourceWindowEnd }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const params = {
                organizationId: organizationId as string,
                projectId: projectId as string,
                clusterIds: clusterIds as readonly string[],
                sourceWindowStart: toClickhouseDateTime(sourceWindowStart),
                sourceWindowEnd: toClickhouseDateTime(sourceWindowEnd),
              }
              const aggregateResult = await client.query({
                // Superseded analysis generations are never deleted; pinning
                // the observation side to the session's current analysis_hash
                // keeps stale observations out of every rate denominator.
                query: `SELECT
                          count() AS source_observation_count,
                          uniqExact(o.session_id) AS source_session_count,
                          uniqExactIf(o.session_id, a.analysis_status != '') AS source_analysis_count,
                          uniqExactIf(o.session_id, a.analysis_status = 'analyzed') AS eligible_session_count,
                          uniqExactIf(o.session_id, startsWith(a.analysis_status, 'skipped')) AS skipped_count,
                          uniqExactIf(o.session_id, a.analysis_status = 'failed') AS failed_count
                        FROM taxonomy_observations AS o FINAL
                        LEFT JOIN session_analyses AS a FINAL
                          ON o.organization_id = a.organization_id
                         AND o.project_id = a.project_id
                         AND o.session_id = a.session_id
                        WHERE o.organization_id = {organizationId:String}
                          AND o.project_id = {projectId:String}
                          AND o.assigned_cluster_id IN {clusterIds:Array(String)}
                          AND (a.analysis_hash = '' OR o.analysis_hash = a.analysis_hash)
                          AND o.start_time >= {sourceWindowStart:DateTime64(9, 'UTC')}
                          AND o.start_time < {sourceWindowEnd:DateTime64(9, 'UTC')}`,
                query_params: params,
                format: "JSONEachRow",
              })
              const aggregate = ((await aggregateResult.json()) as AggregateRow[])[0] ?? {
                source_observation_count: 0,
                source_session_count: 0,
                source_analysis_count: 0,
                eligible_session_count: 0,
                skipped_count: 0,
                failed_count: 0,
              }
              const momentResult = await client.query({
                query: `SELECT m.kind AS key, uniqExact(m.session_id) AS count
                        FROM taxonomy_observations AS o FINAL
                        INNER JOIN session_analyses AS a FINAL
                          ON o.organization_id = a.organization_id
                         AND o.project_id = a.project_id
                         AND o.session_id = a.session_id
                        INNER JOIN session_moment_labels AS m FINAL
                          ON a.organization_id = m.organization_id
                         AND a.project_id = m.project_id
                         AND a.session_id = m.session_id
                         AND a.analysis_hash = m.analysis_hash
                        WHERE o.organization_id = {organizationId:String}
                          AND o.project_id = {projectId:String}
                          AND o.assigned_cluster_id IN {clusterIds:Array(String)}
                          AND o.analysis_hash = a.analysis_hash
                          AND a.analysis_status = 'analyzed'
                          AND o.start_time >= {sourceWindowStart:DateTime64(9, 'UTC')}
                          AND o.start_time < {sourceWindowEnd:DateTime64(9, 'UTC')}
                        GROUP BY key`,
                query_params: params,
                format: "JSONEachRow",
              })
              return {
                sourceObservationCount: aggregate.source_observation_count,
                sourceSessionCount: aggregate.source_session_count,
                sourceAnalysisCount: aggregate.source_analysis_count,
                sourceAnalysisCoverage:
                  aggregate.source_session_count === 0
                    ? 0
                    : aggregate.source_analysis_count / aggregate.source_session_count,
                momentKindDistribution: distributionFromRows((await momentResult.json()) as DistributionRow[]),
                eligibleSessionCount: aggregate.eligible_session_count,
                skippedCount: aggregate.skipped_count,
                failedCount: aggregate.failed_count,
              } satisfies ClusterAnalysisAggregate
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyClusterIntelligenceRepository.getClusterAggregate"),
              ),
            )
        }),
      listRepresentativeExamples: ({
        organizationId,
        projectId,
        clusterIds,
        sourceWindowStart,
        sourceWindowEnd,
        limit,
      }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                          o.session_id AS session_id,
                          JSONExtractString(o.projection_metadata, 'summary') AS summary
                        FROM taxonomy_observations AS o FINAL
                        WHERE o.organization_id = {organizationId:String}
                          AND o.project_id = {projectId:String}
                          AND o.assigned_cluster_id IN {clusterIds:Array(String)}
                          AND o.start_time >= {sourceWindowStart:DateTime64(9, 'UTC')}
                          AND o.start_time < {sourceWindowEnd:DateTime64(9, 'UTC')}
                        ORDER BY o.start_time DESC
                        LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  clusterIds: clusterIds as readonly string[],
                  sourceWindowStart: toClickhouseDateTime(sourceWindowStart),
                  sourceWindowEnd: toClickhouseDateTime(sourceWindowEnd),
                  limit,
                },
                format: "JSONEachRow",
              })
              return ((await result.json()) as ExampleRow[]).map(
                (row): ClusterRepresentativeExample => ({
                  sessionId: row.session_id,
                  summary: row.summary,
                }),
              )
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyClusterIntelligenceRepository.listRepresentativeExamples"),
              ),
            )
        }),
      listSessionTraceIds: ({
        organizationId,
        projectId,
        clusterIds,
        filter,
        momentRange,
        startTimeFrom,
        startTimeTo,
        limit,
      }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          if (clusterIds.length === 0) return []
          const timeFromClause = startTimeFrom ? "AND o.start_time >= {startTimeFrom:DateTime64(9, 'UTC')}" : ""
          const timeToClause = startTimeTo ? "AND o.start_time < {startTimeTo:DateTime64(9, 'UTC')}" : ""
          const momentRangeClause = momentRange ? "AND selectedMomentCount > 0" : ""
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `${behaviourClusterSessionsCte(timeFromClause, timeToClause, Boolean(momentRange))}
                        SELECT traceId
                        FROM enriched_sessions
                        WHERE traceId != ''
                          AND ${behaviourSessionFilterSql}
                          ${momentRangeClause}
                        ORDER BY endTime DESC
                        LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  clusterIds: clusterIds as readonly string[],
                  filter,
                  limit,
                  ...(startTimeFrom ? { startTimeFrom: toClickhouseDateTime(startTimeFrom) } : {}),
                  ...(startTimeTo ? { startTimeTo: toClickhouseDateTime(startTimeTo) } : {}),
                  ...(momentRange
                    ? { momentMetric: momentRange.metric, turnFrom: momentRange.fromTurn, turnTo: momentRange.toTurn }
                    : {}),
                },
                format: "JSONEachRow",
              })
              return ((await result.json()) as { readonly traceId: string }[]).map((row) => TraceId(row.traceId))
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyClusterIntelligenceRepository.listSessionTraceIds"),
              ),
            )
        }),
    }
  }),
)

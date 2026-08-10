import type { ClickHouseClient } from "@clickhouse/client"
import {
  ChSqlClient,
  type ChSqlClientShape,
  type CustomBehaviorId,
  type FacetId,
  TraceId,
  toRepositoryError,
} from "@domain/shared"
import {
  type ClusterAnalysisAggregate,
  type ClusterRepresentativeExample,
  TaxonomyClusterIntelligenceRepository,
} from "@domain/taxonomy"
import { formatCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"

// Which observations belong to the requested clusters. Global reads match the
// observation's own `assigned_cluster_id`; a scoped view (custom behavior) never
// touches that column and instead intersects with that view's edges in the
// `taxonomy_view_assignments` slice, keyed by (custom_behavior_id, facet_id).
// `facet_id` is `''` for a topic cohort and the facet id for a facet-scoped view;
// the facet-projection edges resolve back to the same session `observation_id` in
// `taxonomy_observations`, so moment-label / score rollups read identically.
const GLOBAL_CLUSTER_MEMBERSHIP = "o.assigned_cluster_id IN {clusterIds:Array(String)}"
const SCOPED_CLUSTER_MEMBERSHIP = `o.observation_id IN (
    SELECT observation_id
    FROM taxonomy_view_assignments FINAL
    WHERE organization_id = {organizationId:String}
      AND project_id = {projectId:String}
      AND custom_behavior_id = {customBehaviorId:String}
      AND facet_id = {facetId:String}
      AND assigned_cluster_id IN {clusterIds:Array(String)}
  )`
const clusterMembership = (customBehaviorId: CustomBehaviorId | null | undefined) =>
  customBehaviorId == null ? GLOBAL_CLUSTER_MEMBERSHIP : SCOPED_CLUSTER_MEMBERSHIP
const scopeParams = (customBehaviorId: CustomBehaviorId | null | undefined, facetId: FacetId | null | undefined) =>
  customBehaviorId == null ? {} : { customBehaviorId: customBehaviorId as string, facetId: (facetId ?? "") as string }

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
const behaviourClusterSessionsCte = (
  timeFromClause: string,
  timeToClause: string,
  hasMomentRange: boolean,
  membershipClause: string,
) => `
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
      argMin(o.moment_id, o.start_time) AS momentId,
      any(JSONExtractString(o.projection_metadata, 'summary')) AS summary,
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
      AND ${membershipClause}
      ${timeFromClause}
      ${timeToClause}
    GROUP BY o.organization_id, o.project_id, o.session_id
  ),
  enriched_sessions AS (
    SELECT
      cs.session_id AS sessionId,
      any(cs.traceId) AS traceId,
      ${hasMomentRange ? `argMinIf(m.moment_id, m.first_message_index, ${behaviourMomentRangeSql})` : "any(cs.momentId)"}
        AS momentId,
      any(cs.summary) AS summary,
      any(cs.startTime) AS startTime,
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

const trajectoryBucketExpression = (axis: "day" | "turn") =>
  axis === "day" ? "toString(toDate(cs.startTime))" : "toString(m.first_message_index)"

const parseNumber = (value: unknown): number => {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  return 0
}

type SessionRow = {
  readonly sessionId: string
  readonly traceId: string
  readonly momentId: string
  readonly summary: string
  readonly startTime: string
  readonly endTime: string
  readonly momentKinds: readonly string[]
}

type SessionHistogramRow = {
  readonly startTime: string
  readonly count: number | string
}

type TrajectoryRow = {
  readonly bucket: string
  readonly frequency: number | string
  readonly escalation: number | string
  readonly resolution: number | string
  readonly churnRisk: number | string
  readonly wins: number | string
  readonly maxLastMessageIndex: number | string
  readonly maxEscalationLastMessageIndex: number | string
  readonly maxResolutionLastMessageIndex: number | string
  readonly maxChurnRiskLastMessageIndex: number | string
  readonly maxWinsLastMessageIndex: number | string
}

export const TaxonomyClusterIntelligenceRepositoryLive = Layer.effect(
  TaxonomyClusterIntelligenceRepository,
  Effect.gen(function* () {
    return {
      getClusterAggregate: ({
        organizationId,
        projectId,
        clusterIds,
        sourceWindowStart,
        sourceWindowEnd,
        customBehaviorId,
        facetId,
      }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const membership = clusterMembership(customBehaviorId)
          return yield* chSqlClient
            .query(async (client) => {
              const params = {
                organizationId: organizationId as string,
                projectId: projectId as string,
                clusterIds: clusterIds as readonly string[],
                sourceWindowStart: formatCHDate(sourceWindowStart),
                sourceWindowEnd: formatCHDate(sourceWindowEnd),
                ...scopeParams(customBehaviorId, facetId),
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
                          AND ${membership}
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
                          AND ${membership}
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
        customBehaviorId,
        facetId,
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
                          AND ${clusterMembership(customBehaviorId)}
                          AND o.start_time >= {sourceWindowStart:DateTime64(9, 'UTC')}
                          AND o.start_time < {sourceWindowEnd:DateTime64(9, 'UTC')}
                        ORDER BY o.start_time DESC
                        LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  clusterIds: clusterIds as readonly string[],
                  sourceWindowStart: formatCHDate(sourceWindowStart),
                  sourceWindowEnd: formatCHDate(sourceWindowEnd),
                  limit,
                  ...scopeParams(customBehaviorId, facetId),
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
        customBehaviorId,
        facetId,
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
                query: `${behaviourClusterSessionsCte(timeFromClause, timeToClause, Boolean(momentRange), clusterMembership(customBehaviorId))}
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
                  ...(startTimeFrom ? { startTimeFrom: formatCHDate(startTimeFrom) } : {}),
                  ...(startTimeTo ? { startTimeTo: formatCHDate(startTimeTo) } : {}),
                  ...(momentRange
                    ? { momentMetric: momentRange.metric, turnFrom: momentRange.fromTurn, turnTo: momentRange.toTurn }
                    : {}),
                  ...scopeParams(customBehaviorId, facetId),
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
      listClusterSessions: ({
        organizationId,
        projectId,
        clusterIds,
        filter,
        momentRange,
        startTimeFrom,
        startTimeTo,
        offset,
        limit,
        customBehaviorId,
        facetId,
      }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          if (clusterIds.length === 0) return { sessions: [], histogram: [], hasMore: false, nextOffset: null }
          const timeFromClause = startTimeFrom ? "AND o.start_time >= {startTimeFrom:DateTime64(9, 'UTC')}" : ""
          const timeToClause = startTimeTo ? "AND o.start_time < {startTimeTo:DateTime64(9, 'UTC')}" : ""
          const momentRangeClause = momentRange ? "AND selectedMomentCount > 0" : ""
          const cte = behaviourClusterSessionsCte(
            timeFromClause,
            timeToClause,
            Boolean(momentRange),
            clusterMembership(customBehaviorId),
          )
          const queryParams = {
            organizationId: organizationId as string,
            projectId: projectId as string,
            clusterIds: clusterIds as readonly string[],
            filter,
            ...(startTimeFrom ? { startTimeFrom: formatCHDate(startTimeFrom) } : {}),
            ...(startTimeTo ? { startTimeTo: formatCHDate(startTimeTo) } : {}),
            ...(momentRange
              ? { momentMetric: momentRange.metric, turnFrom: momentRange.fromTurn, turnTo: momentRange.toTurn }
              : {}),
            ...scopeParams(customBehaviorId, facetId),
          }
          // Short windows (≤2 days) bucket hourly; longer windows daily.
          const histogramInterval =
            startTimeFrom && (!startTimeTo || startTimeTo.getTime() - startTimeFrom.getTime() <= 2 * 24 * 60 * 60_000)
              ? "1 HOUR"
              : "1 DAY"
          return yield* chSqlClient
            .query(async (client) => {
              const sessionsResult = await client.query({
                query: `${cte}
                        SELECT sessionId, traceId, momentId, summary, startTime, endTime, momentKinds
                        FROM enriched_sessions
                        WHERE ${behaviourSessionFilterSql}
                        ${momentRangeClause}
                        ORDER BY endTime DESC
                        LIMIT {pageSize:UInt32}
                        OFFSET {offset:UInt32}`,
                query_params: { ...queryParams, pageSize: limit + 1, offset },
                format: "JSONEachRow",
              })
              const rows = (await sessionsResult.json()) as SessionRow[]
              const histogramResult = await client.query({
                query: `${cte}
                        SELECT
                          toStartOfInterval(endTime, INTERVAL ${histogramInterval}) AS startTime,
                          count() AS count
                        FROM enriched_sessions
                        WHERE ${behaviourSessionFilterSql}
                        ${momentRangeClause}
                        GROUP BY startTime
                        ORDER BY startTime ASC`,
                query_params: queryParams,
                format: "JSONEachRow",
              })
              const histogramRows = (await histogramResult.json()) as SessionHistogramRow[]
              const hasMore = rows.length > limit
              return {
                sessions: rows.slice(0, limit).map((row) => ({
                  sessionId: row.sessionId,
                  traceId: row.traceId,
                  momentId: row.momentId,
                  summary: row.summary,
                  startTime: new Date(row.startTime),
                  endTime: new Date(row.endTime),
                  momentKinds: row.momentKinds,
                })),
                histogram: histogramRows.map((bucket) => ({
                  startTime: new Date(bucket.startTime),
                  count: Number(bucket.count),
                })),
                hasMore,
                nextOffset: hasMore ? offset + limit : null,
              }
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyClusterIntelligenceRepository.listClusterSessions"),
              ),
            )
        }),
      getClusterTrajectory: ({
        organizationId,
        projectId,
        clusterIds,
        axis,
        startTimeFrom,
        startTimeTo,
        customBehaviorId,
        facetId,
      }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          if (clusterIds.length === 0) return []
          const timeFromClause = startTimeFrom ? "AND o.start_time >= {startTimeFrom:DateTime64(9, 'UTC')}" : ""
          const timeToClause = startTimeTo ? "AND o.start_time < {startTimeTo:DateTime64(9, 'UTC')}" : ""
          const bucketExpression = trajectoryBucketExpression(axis)
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `
                  WITH latest_analyses AS (
                    SELECT organization_id, project_id, session_id, analysis_hash
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
                      min(o.start_time) AS startTime
                    FROM taxonomy_observations AS o FINAL
                    INNER JOIN latest_analyses AS a
                      ON o.organization_id = a.organization_id
                     AND o.project_id = a.project_id
                     AND o.session_id = a.session_id
                     AND o.analysis_hash = a.analysis_hash
                    WHERE o.organization_id = {organizationId:String}
                      AND o.project_id = {projectId:String}
                      AND ${clusterMembership(customBehaviorId)}
                      ${timeFromClause}
                      ${timeToClause}
                    GROUP BY o.organization_id, o.project_id, o.session_id
                  )
                  SELECT
                    ${bucketExpression} AS bucket,
                    count() AS frequency,
                    countIf(m.kind = 'escalation') AS escalation,
                    countIf(m.kind = 'resolution') AS resolution,
                    countIf(m.kind IN ('abandonment', 'user_frustration')) AS churnRisk,
                    countIf(m.kind IN ('resolution', 'user_satisfaction')) AS wins,
                    max(m.last_message_index) AS maxLastMessageIndex,
                    maxIf(m.last_message_index, m.kind = 'escalation') AS maxEscalationLastMessageIndex,
                    maxIf(m.last_message_index, m.kind = 'resolution') AS maxResolutionLastMessageIndex,
                    maxIf(m.last_message_index, m.kind IN ('abandonment', 'user_frustration')) AS maxChurnRiskLastMessageIndex,
                    maxIf(m.last_message_index, m.kind IN ('resolution', 'user_satisfaction')) AS maxWinsLastMessageIndex
                  FROM cluster_sessions AS cs
                  INNER JOIN session_moment_labels AS m FINAL
                    ON cs.organization_id = m.organization_id
                   AND cs.project_id = m.project_id
                   AND cs.session_id = m.session_id
                   AND cs.analysisHash = m.analysis_hash
                  GROUP BY bucket
                  ORDER BY ${axis === "day" ? "bucket ASC" : "toUInt16(bucket) ASC"}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  clusterIds: clusterIds as readonly string[],
                  ...(startTimeFrom ? { startTimeFrom: formatCHDate(startTimeFrom) } : {}),
                  ...(startTimeTo ? { startTimeTo: formatCHDate(startTimeTo) } : {}),
                  ...scopeParams(customBehaviorId, facetId),
                },
                format: "JSONEachRow",
              })
              return ((await result.json()) as TrajectoryRow[]).map((row) => ({
                bucket: row.bucket,
                frequency: parseNumber(row.frequency),
                escalation: parseNumber(row.escalation),
                resolution: parseNumber(row.resolution),
                churnRisk: parseNumber(row.churnRisk),
                wins: parseNumber(row.wins),
                maxLastMessageIndex: parseNumber(row.maxLastMessageIndex),
                maxEscalationLastMessageIndex: parseNumber(row.maxEscalationLastMessageIndex),
                maxResolutionLastMessageIndex: parseNumber(row.maxResolutionLastMessageIndex),
                maxChurnRiskLastMessageIndex: parseNumber(row.maxChurnRiskLastMessageIndex),
                maxWinsLastMessageIndex: parseNumber(row.maxWinsLastMessageIndex),
              }))
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyClusterIntelligenceRepository.getClusterTrajectory"),
              ),
            )
        }),
    }
  }),
)

import type { ClickHouseClient } from "@clickhouse/client"
import {
  ChSqlClient,
  type ChSqlClientShape,
  OrganizationId,
  ProjectId,
  SessionId,
  TaxonomyClusterId,
  TaxonomyRunId,
  toRepositoryError,
} from "@domain/shared"
import {
  TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
  type TaxonomyMomentObservation,
  TaxonomyObservationRepository,
  taxonomyMomentObservationSchema,
} from "@domain/taxonomy"
import { Effect, Layer } from "effect"

const toClickhouseDateTime = (date: Date): string => date.toISOString().replace("Z", "")
const parseClickhouseDate = (value: string): Date => new Date(`${value.replace(" ", "T")}Z`)

const parseMetadata = (value: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value.length === 0 ? "{}" : value)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}
  return Object.fromEntries(Object.entries(parsed))
}

type TaxonomyObservationRow = {
  readonly organization_id: string
  readonly project_id: string
  readonly observation_id: string
  readonly session_id: string
  readonly analysis_hash: string
  readonly moment_id: string
  readonly projection_method: string
  readonly projection_hash: string
  readonly projection_metadata: string
  readonly embedding: readonly number[]
  readonly assigned_cluster_id: string
  readonly assignment_confidence: number
  readonly assignment_method: string
  readonly reassignment_run_id: string
  readonly start_time: string
  readonly end_time: string
  readonly retention_days: number
  readonly indexed_at: string
}

const selectColumns = `
  organization_id,
  project_id,
  observation_id,
  session_id,
  analysis_hash,
  moment_id,
  projection_method,
  projection_hash,
  projection_metadata,
  embedding,
  assigned_cluster_id,
  assignment_confidence,
  assignment_method,
  reassignment_run_id,
  start_time,
  end_time,
  retention_days,
  indexed_at
`

const latestProjectWindow = `
  SELECT ${selectColumns}
  FROM taxonomy_observations FINAL
  WHERE organization_id = {organizationId:String}
    AND project_id = {projectId:String}
  ORDER BY start_time DESC, observation_id ASC
  LIMIT {windowLimit:UInt32}
`

const latestProjectWindowParams = {
  windowLimit: TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
}

const toInsertRow = (observation: TaxonomyMomentObservation) => ({
  organization_id: observation.organizationId as string,
  project_id: observation.projectId as string,
  observation_id: observation.observationId,
  session_id: observation.sessionId as string,
  analysis_hash: observation.analysisHash,
  moment_id: observation.momentId,
  projection_method: observation.projectionMethod,
  projection_hash: observation.projectionHash,
  projection_metadata: JSON.stringify(observation.projectionMetadata),
  embedding: [...observation.embedding],
  assigned_cluster_id: observation.assignedClusterId ?? "",
  assignment_confidence: observation.assignmentConfidence,
  assignment_method: observation.assignmentMethod,
  reassignment_run_id: observation.reassignmentRunId ?? "",
  start_time: toClickhouseDateTime(observation.startTime),
  end_time: toClickhouseDateTime(observation.endTime),
  retention_days: observation.retentionDays,
  indexed_at: toClickhouseDateTime(observation.indexedAt),
})

const toDomainObservation = (row: TaxonomyObservationRow): TaxonomyMomentObservation =>
  taxonomyMomentObservationSchema.parse({
    organizationId: OrganizationId(row.organization_id),
    projectId: ProjectId(row.project_id),
    observationId: row.observation_id,
    sessionId: SessionId(row.session_id),
    analysisHash: row.analysis_hash,
    momentId: row.moment_id,
    projectionMethod: row.projection_method,
    projectionHash: row.projection_hash,
    projectionMetadata: parseMetadata(row.projection_metadata),
    embedding: row.embedding,
    assignedClusterId: row.assigned_cluster_id === "" ? null : TaxonomyClusterId(row.assigned_cluster_id),
    assignmentConfidence: row.assignment_confidence,
    assignmentMethod: row.assignment_method,
    reassignmentRunId: row.reassignment_run_id === "" ? null : TaxonomyRunId(row.reassignment_run_id),
    startTime: parseClickhouseDate(row.start_time),
    endTime: parseClickhouseDate(row.end_time),
    retentionDays: row.retention_days,
    indexedAt: parseClickhouseDate(row.indexed_at),
  })

export const TaxonomyObservationRepositoryLive = Layer.effect(
  TaxonomyObservationRepository,
  Effect.gen(function* () {
    return {
      upsert: (observation) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client) => {
              await client.insert({
                table: "taxonomy_observations",
                values: [toInsertRow(observation)],
                format: "JSONEachRow",
              })
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "TaxonomyObservationRepository.upsert")))
        }),

      upsertMany: (observations) =>
        Effect.gen(function* () {
          if (observations.length === 0) return
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client) => {
              await client.insert({
                table: "taxonomy_observations",
                values: observations.map(toInsertRow),
                format: "JSONEachRow",
              })
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "TaxonomyObservationRepository.upsertMany")))
        }),

      reassignMany: (inputs) =>
        Effect.gen(function* () {
          if (inputs.length === 0) return
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const values = inputs.map((input) =>
            toInsertRow({
              ...input.observation,
              assignedClusterId: input.assignedClusterId,
              assignmentMethod: input.assignmentMethod,
              assignmentConfidence: input.assignmentConfidence,
              reassignmentRunId: input.reassignmentRunId,
              indexedAt: input.indexedAt,
            }),
          )
          yield* chSqlClient
            .query(async (client) => {
              await client.insert({ table: "taxonomy_observations", values, format: "JSONEachRow" })
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "TaxonomyObservationRepository.reassignMany")))
        }),

      filterExistingIds: ({ organizationId, projectId, observationIds }) =>
        Effect.gen(function* () {
          if (observationIds.length === 0) return []
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT DISTINCT observation_id
                        FROM taxonomy_observations
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND observation_id IN {observationIds:Array(String)}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  observationIds: observationIds as readonly string[],
                },
                format: "JSONEachRow",
              })
              const rows = (await result.json()) as Array<{ readonly observation_id: string }>
              return rows.map((row) => row.observation_id)
            })
            .pipe(
              Effect.mapError((error) => toRepositoryError(error, "TaxonomyObservationRepository.filterExistingIds")),
            )
        }),

      listNoise: ({ organizationId, projectId, since, limit }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${selectColumns}
                        FROM (${latestProjectWindow})
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND assigned_cluster_id = ''
                          AND length(embedding) > 0
                          AND start_time >= {since:DateTime64(9, 'UTC')}
                        ORDER BY start_time DESC, observation_id ASC
                        LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  since: toClickhouseDateTime(since),
                  limit: limit ?? 10_000,
                  ...latestProjectWindowParams,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<TaxonomyObservationRow>()
              return rows.map(toDomainObservation)
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "TaxonomyObservationRepository.listNoise")))
        }),

      listByCluster: ({ organizationId, projectId, clusterId, limit, beforeStartTime, beforeObservationId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const beforeClause = beforeStartTime
            ? "AND (start_time < {beforeStartTime:DateTime64(9, 'UTC')} OR (start_time = {beforeStartTime:DateTime64(9, 'UTC')} AND observation_id > {beforeObservationId:String}))"
            : ""
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${selectColumns}
                        FROM (${latestProjectWindow})
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND assigned_cluster_id = {clusterId:String}
                          ${beforeClause}
                        ORDER BY start_time DESC, observation_id ASC
                        LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  clusterId: clusterId as string,
                  limit,
                  ...(beforeStartTime
                    ? {
                        beforeStartTime: toClickhouseDateTime(beforeStartTime),
                        beforeObservationId: beforeObservationId ?? "",
                      }
                    : {}),
                  ...latestProjectWindowParams,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<TaxonomyObservationRow>()
              return rows.map(toDomainObservation)
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "TaxonomyObservationRepository.listByCluster")))
        }),

      listAllByCluster: ({ organizationId, projectId, clusterId, limit }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${selectColumns}
                        FROM (${latestProjectWindow})
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND assigned_cluster_id = {clusterId:String}
                        ORDER BY start_time DESC, observation_id ASC
                        LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  clusterId: clusterId as string,
                  limit,
                  ...latestProjectWindowParams,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<TaxonomyObservationRow>()
              return rows.map(toDomainObservation)
            })
            .pipe(
              Effect.mapError((error) => toRepositoryError(error, "TaxonomyObservationRepository.listAllByCluster")),
            )
        }),

      listBySession: ({ organizationId, projectId, sessionId, analysisHash }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const hashClause = analysisHash ? "AND analysis_hash = {analysisHash:String}" : ""
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${selectColumns}
                        FROM taxonomy_observations FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND session_id = {sessionId:String}
                          ${hashClause}
                        ORDER BY start_time ASC, observation_id ASC`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  sessionId: sessionId as string,
                  ...(analysisHash ? { analysisHash } : {}),
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<TaxonomyObservationRow>()
              return rows.map(toDomainObservation)
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "TaxonomyObservationRepository.listBySession")))
        }),

      getCounts: ({ organizationId, projectId, since }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                          count() AS total,
                          countIf(assigned_cluster_id != '') AS assigned,
                          countIf(assigned_cluster_id = '') AS noise
                        FROM taxonomy_observations FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND start_time >= {since:DateTime64(9, 'UTC')}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  since: toClickhouseDateTime(since),
                },
                format: "JSONEachRow",
              })
              const [row] = await result.json<{
                total: string | number
                assigned: string | number
                noise: string | number
              }>()
              return {
                total: Number(row?.total ?? 0),
                assigned: Number(row?.assigned ?? 0),
                noise: Number(row?.noise ?? 0),
              }
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "TaxonomyObservationRepository.getCounts")))
        }),

      getTopClustersByOccurrence: ({ organizationId, projectId, since, limit }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT assigned_cluster_id AS cluster_id, count() AS count
                        FROM (${latestProjectWindow})
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND start_time >= {since:DateTime64(9, 'UTC')}
                          AND assigned_cluster_id != ''
                        GROUP BY assigned_cluster_id
                        ORDER BY count DESC, assigned_cluster_id ASC
                        LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  since: toClickhouseDateTime(since),
                  limit,
                  ...latestProjectWindowParams,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<{ cluster_id: string; count: string | number }>()
              return rows.map((row) => ({ clusterId: TaxonomyClusterId(row.cluster_id), count: Number(row.count) }))
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyObservationRepository.getTopClustersByOccurrence"),
              ),
            )
        }),

      getClusterAssignmentCounts: ({ organizationId, projectId, clusterIds, startTimeFrom, startTimeTo }) =>
        Effect.gen(function* () {
          if (clusterIds.length === 0) return []
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const fromClause = startTimeFrom ? "AND start_time >= {startTimeFrom:DateTime64(9, 'UTC')}" : ""
          const toClause = startTimeTo ? "AND start_time < {startTimeTo:DateTime64(9, 'UTC')}" : ""
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                          assigned_cluster_id AS cluster_id,
                          count() AS count,
                          min(start_time) AS first_observed_at,
                          max(start_time) AS last_observed_at
                        FROM (${latestProjectWindow})
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND assigned_cluster_id IN {clusterIds:Array(String)}
                          ${fromClause}
                          ${toClause}
                        GROUP BY assigned_cluster_id`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  clusterIds: clusterIds as readonly string[],
                  ...(startTimeFrom ? { startTimeFrom: toClickhouseDateTime(startTimeFrom) } : {}),
                  ...(startTimeTo ? { startTimeTo: toClickhouseDateTime(startTimeTo) } : {}),
                  ...latestProjectWindowParams,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<{
                cluster_id: string
                count: string | number
                first_observed_at: string
                last_observed_at: string
              }>()
              return rows.map((row) => ({
                clusterId: TaxonomyClusterId(row.cluster_id),
                count: Number(row.count),
                firstObservedAt: parseClickhouseDate(row.first_observed_at),
                lastObservedAt: parseClickhouseDate(row.last_observed_at),
              }))
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyObservationRepository.getClusterAssignmentCounts"),
              ),
            )
        }),

      getClusterTrendCounts: ({ organizationId, projectId, clusterIds, currentSince, baselineSince, baselineDays }) =>
        Effect.gen(function* () {
          if (clusterIds.length === 0) return []
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                          assigned_cluster_id AS cluster_id,
                          countIf(start_time >= {currentSince:DateTime64(9, 'UTC')}) AS current_count,
                          countIf(start_time >= {baselineSince:DateTime64(9, 'UTC')} AND start_time < {currentSince:DateTime64(9, 'UTC')}) AS baseline_count
                        FROM (${latestProjectWindow})
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND assigned_cluster_id IN {clusterIds:Array(String)}
                          AND start_time >= {baselineSince:DateTime64(9, 'UTC')}
                        GROUP BY assigned_cluster_id`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  clusterIds: clusterIds as readonly string[],
                  currentSince: toClickhouseDateTime(currentSince),
                  baselineSince: toClickhouseDateTime(baselineSince),
                  ...latestProjectWindowParams,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<{
                cluster_id: string
                current_count: string | number
                baseline_count: string | number
              }>()
              const rowByClusterId = new Map(rows.map((row) => [row.cluster_id, row]))
              return clusterIds.map((clusterId) => {
                const row = rowByClusterId.get(clusterId as string)
                return {
                  clusterId,
                  currentCount: Number(row?.current_count ?? 0),
                  baselineCount: Number(row?.baseline_count ?? 0),
                  baselineDays,
                }
              })
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyObservationRepository.getClusterTrendCounts"),
              ),
            )
        }),
    }
  }),
)

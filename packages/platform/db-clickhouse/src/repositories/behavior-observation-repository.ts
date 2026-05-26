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
import { BehaviorObservationRepository, type TaxonomyObservation, taxonomyObservationSchema } from "@domain/taxonomy"
import { Effect, Layer } from "effect"

// ClickHouse DateTime64 rejects trailing 'Z'; strip it.
const toClickhouseDateTime = (date: Date): string => date.toISOString().replace("Z", "")

// CH's JSONEachRow date format is `YYYY-MM-DD HH:MM:SS.fff` — swap space for
// `T` and tag UTC so `new Date(...)` parses reliably across runtimes.
const parseClickhouseDate = (value: string): Date => new Date(`${value.replace(" ", "T")}Z`)

type BehaviorObservationRow = {
  readonly organization_id: string
  readonly project_id: string
  readonly session_id: string
  readonly start_time: string
  readonly end_time: string
  readonly trace_ids: readonly string[]
  readonly summary: string
  readonly summary_hash: string
  readonly embedding: readonly number[]
  readonly embedding_model: string
  readonly assigned_cluster_id: string
  readonly assignment_confidence: number
  readonly assignment_method: string
  readonly reassignment_run_id: string
  readonly retention_days: number
  readonly indexed_at: string
}

const toInsertRow = (observation: TaxonomyObservation) => ({
  organization_id: observation.organizationId as string,
  project_id: observation.projectId as string,
  session_id: observation.sessionId as string,
  start_time: toClickhouseDateTime(observation.startTime),
  end_time: toClickhouseDateTime(observation.endTime),
  trace_ids: [...observation.traceIds],
  summary: observation.summary,
  summary_hash: observation.summaryHash,
  embedding: [...observation.embedding],
  embedding_model: observation.embeddingModel,
  assigned_cluster_id: observation.assignedClusterId ?? "",
  assignment_confidence: observation.assignmentConfidence,
  assignment_method: observation.assignmentMethod,
  reassignment_run_id: observation.reassignmentRunId ?? "",
  retention_days: observation.retentionDays,
  indexed_at: toClickhouseDateTime(observation.indexedAt),
})

const toDomainObservation = (row: BehaviorObservationRow): TaxonomyObservation =>
  taxonomyObservationSchema.parse({
    organizationId: OrganizationId(row.organization_id),
    projectId: ProjectId(row.project_id),
    sessionId: SessionId(row.session_id),
    startTime: parseClickhouseDate(row.start_time),
    endTime: parseClickhouseDate(row.end_time),
    traceIds: row.trace_ids,
    summary: row.summary,
    summaryHash: row.summary_hash,
    embedding: row.embedding,
    embeddingModel: row.embedding_model,
    assignedClusterId: row.assigned_cluster_id === "" ? null : TaxonomyClusterId(row.assigned_cluster_id),
    assignmentConfidence: row.assignment_confidence,
    assignmentMethod: row.assignment_method,
    reassignmentRunId: row.reassignment_run_id === "" ? null : TaxonomyRunId(row.reassignment_run_id),
    retentionDays: row.retention_days,
    indexedAt: parseClickhouseDate(row.indexed_at),
  })

const selectColumns = `
  organization_id,
  project_id,
  session_id,
  start_time,
  end_time,
  trace_ids,
  summary,
  summary_hash,
  embedding,
  embedding_model,
  assigned_cluster_id,
  assignment_confidence,
  assignment_method,
  reassignment_run_id,
  retention_days,
  indexed_at
`

export const BehaviorObservationRepositoryLive = Layer.effect(
  BehaviorObservationRepository,
  Effect.gen(function* () {
    return {
      upsert: (observation) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client) => {
              await client.insert({
                table: "behavior_observations",
                values: [toInsertRow(observation)],
                format: "JSONEachRow",
              })
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "BehaviorObservationRepository.upsert")))
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
              await client.insert({ table: "behavior_observations", values, format: "JSONEachRow" })
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "BehaviorObservationRepository.reassignMany")))
        }),

      listNoise: ({ organizationId, projectId, since, limit }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${selectColumns}
                        FROM behavior_observations FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND assigned_cluster_id = ''
                          AND length(embedding) > 0
                          AND start_time >= {since:DateTime64(9, 'UTC')}
                        ORDER BY start_time DESC
                        LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  since: toClickhouseDateTime(since),
                  limit: limit ?? 10_000,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<BehaviorObservationRow>()
              return rows.map(toDomainObservation)
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "BehaviorObservationRepository.listNoise")))
        }),

      listByCluster: ({ organizationId, projectId, clusterId, limit, beforeStartTime, beforeSessionId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const beforeClause = beforeStartTime
            ? "AND (start_time < {beforeStartTime:DateTime64(9, 'UTC')} OR (start_time = {beforeStartTime:DateTime64(9, 'UTC')} AND session_id > {beforeSessionId:String}))"
            : ""
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${selectColumns}
                        FROM behavior_observations FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND assigned_cluster_id = {clusterId:String}
                          ${beforeClause}
                        ORDER BY start_time DESC, session_id ASC
                        LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  clusterId: clusterId as string,
                  limit,
                  ...(beforeStartTime
                    ? { beforeStartTime: toClickhouseDateTime(beforeStartTime), beforeSessionId: beforeSessionId ?? "" }
                    : {}),
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<BehaviorObservationRow>()
              return rows.map(toDomainObservation)
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "BehaviorObservationRepository.listByCluster")))
        }),

      listAllByCluster: ({ organizationId, projectId, clusterId, limit }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${selectColumns}
                        FROM behavior_observations FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND assigned_cluster_id = {clusterId:String}
                        ORDER BY start_time DESC, session_id ASC
                        LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  clusterId: clusterId as string,
                  limit,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<BehaviorObservationRow>()
              return rows.map(toDomainObservation)
            })
            .pipe(
              Effect.mapError((error) => toRepositoryError(error, "BehaviorObservationRepository.listAllByCluster")),
            )
        }),

      findBySummaryHash: ({ organizationId, projectId, sessionId, summaryHash }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${selectColumns}
                        FROM behavior_observations FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND session_id = {sessionId:String}
                          AND summary_hash = {summaryHash:String}
                        ORDER BY indexed_at DESC
                        LIMIT 1`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  sessionId: sessionId as string,
                  summaryHash,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<BehaviorObservationRow>()
              return rows[0] ? toDomainObservation(rows[0]) : null
            })
            .pipe(
              Effect.mapError((error) => toRepositoryError(error, "BehaviorObservationRepository.findBySummaryHash")),
            )
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
                        FROM behavior_observations FINAL
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
            .pipe(Effect.mapError((error) => toRepositoryError(error, "BehaviorObservationRepository.getCounts")))
        }),

      getTopClustersByOccurrence: ({ organizationId, projectId, since, limit }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT assigned_cluster_id AS cluster_id, count() AS count
                        FROM behavior_observations FINAL
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
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<{ cluster_id: string; count: string | number }>()
              return rows.map((row) => ({ clusterId: TaxonomyClusterId(row.cluster_id), count: Number(row.count) }))
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "BehaviorObservationRepository.getTopClustersByOccurrence"),
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
                        FROM behavior_observations FINAL
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
                toRepositoryError(error, "BehaviorObservationRepository.getClusterTrendCounts"),
              ),
            )
        }),
    }
  }),
)

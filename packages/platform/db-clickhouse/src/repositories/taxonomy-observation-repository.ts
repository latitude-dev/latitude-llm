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
  type TaxonomyClusteringObservation,
  type TaxonomyMomentObservation,
  TaxonomyObservationRepository,
  type TaxonomyReassignmentWindowObservation,
  type TaxonomyScopedClusteringObservation,
  taxonomyMomentObservationSchema,
} from "@domain/taxonomy"
import { formatCHDate, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"
import { buildSessionFilterClauses, LIST_SELECT, resolvePercentileFilters } from "./session-repository.ts"

const parseMetadata = (value: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value.length === 0 ? "{}" : value)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}
  return Object.fromEntries(Object.entries(parsed))
}

export type TaxonomyObservationRow = {
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

type TaxonomyClusteringObservationRow = {
  readonly observation_id: string
  readonly start_time: string
  readonly embedding: readonly number[]
}

export const selectColumns = `
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

export const validObservationIdClause = "length(observation_id) = 24"

const latestProjectWindow = `
  SELECT ${selectColumns}
  FROM taxonomy_observations FINAL
  WHERE organization_id = {organizationId:String}
    AND project_id = {projectId:String}
    AND ${validObservationIdClause}
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
  start_time: formatCHDate(observation.startTime),
  end_time: formatCHDate(observation.endTime),
  retention_days: observation.retentionDays,
  indexed_at: formatCHDate(observation.indexedAt),
})

const toDomainClusteringObservation = (row: TaxonomyClusteringObservationRow): TaxonomyClusteringObservation => ({
  observationId: row.observation_id,
  embedding: row.embedding,
  startTime: parseCHDate(row.start_time),
})

type TaxonomyReassignmentWindowRow = {
  readonly observation_id: string
  readonly session_id: string
  readonly embedding: readonly number[]
  readonly start_time: string
  readonly assigned_cluster_id: string
}

const toDomainReassignmentWindow = (row: TaxonomyReassignmentWindowRow): TaxonomyReassignmentWindowObservation => ({
  observationId: row.observation_id,
  sessionId: SessionId(row.session_id),
  embedding: row.embedding,
  startTime: parseCHDate(row.start_time),
  assignedClusterId: row.assigned_cluster_id === "" ? null : row.assigned_cluster_id,
})

type TaxonomyScopedClusteringObservationRow = TaxonomyClusteringObservationRow & { readonly session_id: string }

const toDomainScopedClusteringObservation = (
  row: TaxonomyScopedClusteringObservationRow,
): TaxonomyScopedClusteringObservation => ({
  observationId: row.observation_id,
  sessionId: SessionId(row.session_id),
  embedding: row.embedding,
  startTime: parseCHDate(row.start_time),
})

export const toDomainObservation = (row: TaxonomyObservationRow): TaxonomyMomentObservation =>
  taxonomyMomentObservationSchema.parse({
    organizationId: OrganizationId(row.organization_id),
    projectId: ProjectId(row.project_id),
    // Legacy rows written before the write path gained .slice(0,24) carry full-length
    // hash strings; truncate so they pass cuidSchema. TODO: remove once retention
    // has expired all pre-fix rows from taxonomy_observations.
    observationId: row.observation_id.slice(0, 24),
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
    startTime: parseCHDate(row.start_time),
    endTime: parseCHDate(row.end_time),
    retentionDays: row.retention_days,
    indexedAt: parseCHDate(row.indexed_at),
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

      reassignManyById: ({ organizationId, projectId, assignments }) =>
        Effect.gen(function* () {
          if (assignments.length === 0) return
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const groups = new Map<string, Array<(typeof assignments)[number]>>()
          for (const assignment of assignments) {
            const key = `${assignment.assignmentMethod}\0${assignment.reassignmentRunId}\0${assignment.indexedAt.toISOString()}`
            const group = groups.get(key) ?? []
            group.push(assignment)
            groups.set(key, group)
          }

          yield* chSqlClient
            .query(async (client) => {
              for (const group of groups.values()) {
                const first = group[0]
                if (!first) continue
                await client.command({
                  query: `INSERT INTO taxonomy_observations (${selectColumns})
                          WITH
                            {observationIds:Array(String)} AS observationIds,
                            {assignedClusterIds:Array(String)} AS assignedClusterIds,
                            {assignmentConfidences:Array(Float32)} AS assignmentConfidences
                          SELECT
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
                            assignedClusterIds[indexOf(observationIds, observation_id)],
                            assignmentConfidences[indexOf(observationIds, observation_id)],
                            {assignmentMethod:String},
                            {reassignmentRunId:String},
                            start_time,
                            end_time,
                            retention_days,
                            {indexedAt:DateTime64(3, 'UTC')}
                          FROM taxonomy_observations FINAL
                          WHERE organization_id = {organizationId:String}
                            AND project_id = {projectId:String}
                            AND ${validObservationIdClause}
                            AND observation_id IN {observationIds:Array(String)}`,
                  query_params: {
                    organizationId: organizationId as string,
                    projectId: projectId as string,
                    observationIds: group.map((assignment) => assignment.observationId),
                    assignedClusterIds: group.map((assignment) => assignment.assignedClusterId as string),
                    assignmentConfidences: group.map((assignment) => assignment.assignmentConfidence),
                    assignmentMethod: first.assignmentMethod,
                    reassignmentRunId: first.reassignmentRunId as string,
                    indexedAt: formatCHDate(first.indexedAt),
                  },
                })
              }
            })
            .pipe(
              Effect.mapError((error) => toRepositoryError(error, "TaxonomyObservationRepository.reassignManyById")),
            )
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
                          AND ${validObservationIdClause}
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
                  since: formatCHDate(since),
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

      listForClustering: ({ organizationId, projectId, since, limit }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              // Day-stratified sample across the lookback window, NOT newest-N.
              // The inner window ranks each observation within its own day by a
              // deterministic hash, then `ORDER BY rn` interleaves days
              // round-robin: every active day contributes its rank-1 row before
              // any day contributes its rank-2 row, and so on until `limit`.
              // High-volume days keep contributing in later rounds; sparse days
              // drop out once exhausted. The result is representative of the
              // whole window instead of biased to the last few hours, and is
              // deterministic (cityHash64, no rand()) so Temporal replays match.
              // The inner scan selects observation_id only, so the embedding
              // column is never materialized while ranking the full window.
              const result = await client.query({
                query: `SELECT ${selectColumns}
                        FROM taxonomy_observations FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND ${validObservationIdClause}
                          AND length(embedding) > 0
                          AND start_time >= {since:DateTime64(9, 'UTC')}
                          AND observation_id IN (
                            SELECT observation_id
                            FROM (
                              SELECT
                                observation_id,
                                row_number() OVER (
                                  PARTITION BY toDate(start_time)
                                  ORDER BY cityHash64(observation_id)
                                ) AS rn
                              FROM taxonomy_observations FINAL
                              WHERE organization_id = {organizationId:String}
                                AND project_id = {projectId:String}
                                AND ${validObservationIdClause}
                                AND length(embedding) > 0
                                AND start_time >= {since:DateTime64(9, 'UTC')}
                            )
                            ORDER BY rn ASC, observation_id ASC
                            LIMIT {limit:UInt32}
                          )
                        ORDER BY start_time DESC, observation_id ASC`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  since: formatCHDate(since),
                  limit,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<TaxonomyObservationRow>()
              return rows.map(toDomainObservation)
            })
            .pipe(
              Effect.mapError((error) => toRepositoryError(error, "TaxonomyObservationRepository.listForClustering")),
            )
        }),

      listForClusteringSample: ({ organizationId, projectId, since, limit }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                          observation_id,
                          start_time,
                          embedding
                        FROM taxonomy_observations FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND ${validObservationIdClause}
                          AND length(embedding) > 0
                          AND start_time >= {since:DateTime64(9, 'UTC')}
                          AND observation_id IN (
                            SELECT observation_id
                            FROM (
                              SELECT
                                observation_id,
                                row_number() OVER (
                                  PARTITION BY toDate(start_time)
                                  ORDER BY cityHash64(observation_id)
                                ) AS rn
                              FROM taxonomy_observations FINAL
                              WHERE organization_id = {organizationId:String}
                                AND project_id = {projectId:String}
                                AND ${validObservationIdClause}
                                AND length(embedding) > 0
                                AND start_time >= {since:DateTime64(9, 'UTC')}
                            )
                            ORDER BY rn ASC, observation_id ASC
                            LIMIT {limit:UInt32}
                          )
                        ORDER BY start_time DESC, observation_id ASC`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  since: formatCHDate(since),
                  limit,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<TaxonomyClusteringObservationRow>()
              return rows.map(toDomainClusteringObservation)
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyObservationRepository.listForClusteringSample"),
              ),
            )
        }),

      listForCustomBehaviorSample: ({ organizationId, projectId, since, limit, filterSet }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          // Percentile filters carry `gtePercentile`, which the session compiler
          // has no SQL mapping for; resolve them to concrete `gte` thresholds first,
          // exactly as the Sessions list paths do.
          const resolvedFilterSet = yield* resolvePercentileFilters(organizationId, projectId, filterSet)
          return yield* chSqlClient
            .query(async (client) => {
              // Resolve the behavior's filterSet into the matching sessions with
              // the same compiler the Sessions list uses (topics are already
              // excluded by the custom-behavior Zod contract; moments stay).
              const { havingClauses, whereClauses, params: filterParams } = buildSessionFilterClauses(resolvedFilterSet)
              const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""
              const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
              // havingClauses reference the rollup aliases defined in LIST_SELECT
              // (models, tags, cost_total_microcents, duration_ns, start_time, …),
              // so the grouped projection that materializes them must run before
              // HAVING. Mirror the Sessions list query — group with LIST_SELECT in a
              // derived table, then project session_id back out for the IN filter.
              const matchingSessions = `session_id IN (
                        SELECT session_id
                        FROM (
                          SELECT ${LIST_SELECT}
                          FROM sessions
                          WHERE organization_id = {organizationId:String}
                            AND project_id = {projectId:String}
                            ${extraWhere}
                          GROUP BY organization_id, project_id, session_id
                          ${havingClause}
                        )
                      )`
              const result = await client.query({
                query: `SELECT
                          observation_id,
                          session_id,
                          start_time,
                          embedding
                        FROM taxonomy_observations FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND ${validObservationIdClause}
                          AND length(embedding) > 0
                          AND start_time >= {since:DateTime64(9, 'UTC')}
                          AND ${matchingSessions}
                          AND observation_id IN (
                            SELECT observation_id
                            FROM (
                              SELECT
                                observation_id,
                                row_number() OVER (
                                  PARTITION BY toDate(start_time)
                                  ORDER BY cityHash64(observation_id)
                                ) AS rn
                              FROM taxonomy_observations FINAL
                              WHERE organization_id = {organizationId:String}
                                AND project_id = {projectId:String}
                                AND ${validObservationIdClause}
                                AND length(embedding) > 0
                                AND start_time >= {since:DateTime64(9, 'UTC')}
                                AND ${matchingSessions}
                            )
                            ORDER BY rn ASC, observation_id ASC
                            LIMIT {limit:UInt32}
                          )
                        ORDER BY start_time DESC, observation_id ASC`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  since: formatCHDate(since),
                  limit,
                  ...filterParams,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<TaxonomyScopedClusteringObservationRow>()
              return rows.map(toDomainScopedClusteringObservation)
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyObservationRepository.listForCustomBehaviorSample"),
              ),
            )
        }),

      listWindowForReassignment: ({ organizationId, projectId, limit, filterSet }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          // Scoped reassignment restricts the window to the behavior's sessions
          // with the same compiler the sample/preview use; global reads the whole
          // newest-N live window.
          const resolvedFilterSet = filterSet
            ? yield* resolvePercentileFilters(organizationId, projectId, filterSet)
            : undefined
          return yield* chSqlClient
            .query(async (client) => {
              let matchingSessionsClause = ""
              let filterParams: Record<string, unknown> = {}
              if (resolvedFilterSet) {
                const { havingClauses, whereClauses, params } = buildSessionFilterClauses(resolvedFilterSet)
                filterParams = params
                const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""
                const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
                matchingSessionsClause = `AND session_id IN (
                        SELECT session_id
                        FROM (
                          SELECT ${LIST_SELECT}
                          FROM sessions
                          WHERE organization_id = {organizationId:String}
                            AND project_id = {projectId:String}
                            ${extraWhere}
                          GROUP BY organization_id, project_id, session_id
                          ${havingClause}
                        )
                      )`
              }
              const result = await client.query({
                query: `SELECT
                          observation_id,
                          session_id,
                          embedding,
                          start_time,
                          assigned_cluster_id
                        FROM taxonomy_observations FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND ${validObservationIdClause}
                          AND length(embedding) > 0
                          ${matchingSessionsClause}
                        ORDER BY start_time DESC, observation_id ASC
                        LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  limit,
                  ...filterParams,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<TaxonomyReassignmentWindowRow>()
              return rows.map(toDomainReassignmentWindow)
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyObservationRepository.listWindowForReassignment"),
              ),
            )
        }),

      countForCustomBehaviorSample: ({ organizationId, projectId, since, filterSet }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const resolvedFilterSet = yield* resolvePercentileFilters(organizationId, projectId, filterSet)
          return yield* chSqlClient
            .query(async (client) => {
              // Same session compiler and window scoping as listForCustomBehaviorSample,
              // minus the day-stratified sampling: the preview reports the true eligible
              // totals, so what the user sees is exactly what gardening will sample.
              const { havingClauses, whereClauses, params: filterParams } = buildSessionFilterClauses(resolvedFilterSet)
              const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""
              const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
              const matchingSessions = `session_id IN (
                        SELECT session_id
                        FROM (
                          SELECT ${LIST_SELECT}
                          FROM sessions
                          WHERE organization_id = {organizationId:String}
                            AND project_id = {projectId:String}
                            ${extraWhere}
                          GROUP BY organization_id, project_id, session_id
                          ${havingClause}
                        )
                      )`
              const result = await client.query({
                query: `SELECT
                          count() AS observation_count,
                          uniqExact(session_id) AS session_count
                        FROM taxonomy_observations FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND ${validObservationIdClause}
                          AND length(embedding) > 0
                          AND start_time >= {since:DateTime64(9, 'UTC')}
                          AND ${matchingSessions}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  since: formatCHDate(since),
                  ...filterParams,
                },
                format: "JSONEachRow",
              })
              const [row] = await result.json<{
                observation_count: string | number
                session_count: string | number
              }>()
              return {
                observationCount: Number(row?.observation_count ?? 0),
                sessionCount: Number(row?.session_count ?? 0),
              }
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyObservationRepository.countForCustomBehaviorSample"),
              ),
            )
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
                        beforeStartTime: formatCHDate(beforeStartTime),
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
                          AND ${validObservationIdClause}
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
                          AND ${validObservationIdClause}
                          AND start_time >= {since:DateTime64(9, 'UTC')}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  since: formatCHDate(since),
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
                  since: formatCHDate(since),
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
                  ...(startTimeFrom ? { startTimeFrom: formatCHDate(startTimeFrom) } : {}),
                  ...(startTimeTo ? { startTimeTo: formatCHDate(startTimeTo) } : {}),
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
                firstObservedAt: parseCHDate(row.first_observed_at),
                lastObservedAt: parseCHDate(row.last_observed_at),
              }))
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyObservationRepository.getClusterAssignmentCounts"),
              ),
            )
        }),

      getClusterCountsByUser: ({ organizationId, projectId, userId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
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
                          AND assigned_cluster_id != ''
                          AND session_id IN (
                            SELECT session_id
                            FROM sessions
                            WHERE organization_id = {organizationId:String}
                              AND project_id = {projectId:String}
                            GROUP BY organization_id, project_id, session_id
                            HAVING argMaxIfMerge(user_id) = {userId:String}
                          )
                        GROUP BY assigned_cluster_id
                        ORDER BY count DESC, assigned_cluster_id ASC`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  userId: userId as string,
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
                firstObservedAt: parseCHDate(row.first_observed_at),
                lastObservedAt: parseCHDate(row.last_observed_at),
              }))
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyObservationRepository.getClusterCountsByUser"),
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
                  currentSince: formatCHDate(currentSince),
                  baselineSince: formatCHDate(baselineSince),
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

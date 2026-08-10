import type { ClickHouseClient } from "@clickhouse/client"
import {
  ChSqlClient,
  type ChSqlClientShape,
  CustomBehaviorId,
  FacetId,
  OrganizationId,
  ProjectId,
  SessionId,
  TaxonomyClusterId,
  TaxonomyRunId,
  toRepositoryError,
} from "@domain/shared"
import {
  type TaxonomyViewAssignment,
  TaxonomyViewAssignmentRepository,
  taxonomyViewAssignmentSchema,
} from "@domain/taxonomy"
import { formatCHDate, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"
import {
  type TaxonomyObservationRow,
  selectColumns as taxonomyObservationSelectColumns,
  toDomainObservation,
  validObservationIdClause,
} from "./taxonomy-observation-repository.ts"

type TaxonomyViewAssignmentRow = {
  readonly organization_id: string
  readonly project_id: string
  readonly custom_behavior_id: string
  readonly facet_id: string
  readonly observation_id: string
  readonly session_id: string
  readonly assigned_cluster_id: string
  readonly assignment_confidence: number
  readonly assignment_method: string
  readonly reassignment_run_id: string
  readonly start_time: string
  readonly retention_days: number
  readonly indexed_at: string
}

const selectColumns = `
  organization_id,
  project_id,
  custom_behavior_id,
  facet_id,
  observation_id,
  session_id,
  assigned_cluster_id,
  assignment_confidence,
  assignment_method,
  reassignment_run_id,
  start_time,
  retention_days,
  indexed_at
`

const toInsertRow = (assignment: TaxonomyViewAssignment) => ({
  organization_id: assignment.organizationId as string,
  project_id: assignment.projectId as string,
  custom_behavior_id: assignment.customBehaviorId as string,
  facet_id: (assignment.facetId ?? "") as string,
  observation_id: assignment.observationId,
  session_id: assignment.sessionId as string,
  assigned_cluster_id: assignment.assignedClusterId ?? "",
  assignment_confidence: assignment.assignmentConfidence,
  assignment_method: assignment.assignmentMethod,
  reassignment_run_id: assignment.reassignmentRunId ?? "",
  start_time: formatCHDate(assignment.startTime),
  retention_days: assignment.retentionDays,
  indexed_at: formatCHDate(assignment.indexedAt),
})

const toDomain = (row: TaxonomyViewAssignmentRow): TaxonomyViewAssignment =>
  taxonomyViewAssignmentSchema.parse({
    organizationId: OrganizationId(row.organization_id),
    projectId: ProjectId(row.project_id),
    customBehaviorId: CustomBehaviorId(row.custom_behavior_id),
    facetId: row.facet_id === "" ? null : FacetId(row.facet_id),
    observationId: row.observation_id,
    sessionId: SessionId(row.session_id),
    assignedClusterId: row.assigned_cluster_id === "" ? null : TaxonomyClusterId(row.assigned_cluster_id),
    assignmentConfidence: row.assignment_confidence,
    assignmentMethod: row.assignment_method,
    reassignmentRunId: row.reassignment_run_id === "" ? null : TaxonomyRunId(row.reassignment_run_id),
    startTime: parseCHDate(row.start_time),
    retentionDays: row.retention_days,
    indexedAt: parseCHDate(row.indexed_at),
  })

export const TaxonomyViewAssignmentRepositoryLive = Layer.effect(
  TaxonomyViewAssignmentRepository,
  Effect.gen(function* () {
    return {
      upsertMany: (assignments) =>
        Effect.gen(function* () {
          if (assignments.length === 0) return
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client) => {
              await client.insert({
                table: "taxonomy_view_assignments",
                values: assignments.map(toInsertRow),
                format: "JSONEachRow",
              })
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "TaxonomyViewAssignmentRepository.upsertMany")))
        }),

      listByBehavior: ({ organizationId, projectId, customBehaviorId, limit }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${selectColumns}
                        FROM taxonomy_view_assignments FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND custom_behavior_id = {customBehaviorId:String}
                          AND facet_id = ''
                        ORDER BY start_time DESC, observation_id ASC
                        LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  customBehaviorId: customBehaviorId as string,
                  limit,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<TaxonomyViewAssignmentRow>()
              return rows.map(toDomain)
            })
            .pipe(
              Effect.mapError((error) => toRepositoryError(error, "TaxonomyViewAssignmentRepository.listByBehavior")),
            )
        }),

      getClusterAssignmentCounts: ({
        organizationId,
        projectId,
        customBehaviorId,
        facetId,
        startTimeFrom,
        startTimeTo,
      }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT assigned_cluster_id AS cluster_id, count() AS count
                        FROM taxonomy_view_assignments FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND custom_behavior_id = {customBehaviorId:String}
                          AND facet_id = {facetId:String}
                          AND assigned_cluster_id != ''
                          ${startTimeFrom ? "AND start_time >= {startTimeFrom:DateTime64(9, 'UTC')}" : ""}
                          ${startTimeTo ? "AND start_time < {startTimeTo:DateTime64(9, 'UTC')}" : ""}
                        GROUP BY assigned_cluster_id
                        ORDER BY count DESC, assigned_cluster_id ASC`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  customBehaviorId: customBehaviorId as string,
                  facetId: (facetId ?? "") as string,
                  ...(startTimeFrom ? { startTimeFrom: formatCHDate(startTimeFrom) } : {}),
                  ...(startTimeTo ? { startTimeTo: formatCHDate(startTimeTo) } : {}),
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<{ cluster_id: string; count: string | number }>()
              return rows.map((row) => ({ clusterId: TaxonomyClusterId(row.cluster_id), count: Number(row.count) }))
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyViewAssignmentRepository.getClusterAssignmentCounts"),
              ),
            )
        }),

      // Scoped mirror of TaxonomyObservationRepository.getClusterTrendCounts:
      // current (>= currentSince) vs baseline ([baselineSince, currentSince))
      // counts over the accumulated `taxonomy_view_assignments` slice.
      getClusterTrendCounts: ({
        organizationId,
        projectId,
        customBehaviorId,
        facetId,
        clusterIds,
        currentSince,
        baselineSince,
        baselineDays,
      }) =>
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
                        FROM taxonomy_view_assignments FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND custom_behavior_id = {customBehaviorId:String}
                          AND facet_id = {facetId:String}
                          AND assigned_cluster_id IN {clusterIds:Array(String)}
                          AND start_time >= {baselineSince:DateTime64(9, 'UTC')}
                        GROUP BY assigned_cluster_id`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  customBehaviorId: customBehaviorId as string,
                  facetId: (facetId ?? "") as string,
                  clusterIds: clusterIds as readonly string[],
                  currentSince: formatCHDate(currentSince),
                  baselineSince: formatCHDate(baselineSince),
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
                toRepositoryError(error, "TaxonomyViewAssignmentRepository.getClusterTrendCounts"),
              ),
            )
        }),

      // Resolve a scoped cluster's members for the naming step. The topic path
      // (facetId null) joins the slice back to `taxonomy_observations` for the
      // transcript summaries; a facet-scoped path joins to `taxonomy_facet_projections`
      // for the extracted one-sentence answers. Read-only on both source tables.
      listClusterMemberObservations: ({ organizationId, projectId, customBehaviorId, facetId, clusterId, limit }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const customBehaviorParam = customBehaviorId as string
          const facetParam = (facetId ?? "") as string
          const memberIds = `
            SELECT observation_id
            FROM taxonomy_view_assignments FINAL
            WHERE organization_id = {organizationId:String}
              AND project_id = {projectId:String}
              AND custom_behavior_id = {customBehaviorId:String}
              AND facet_id = {facetId:String}
              AND assigned_cluster_id = {clusterId:String}`
          return yield* chSqlClient
            .query(async (client) => {
              const query =
                facetParam === ""
                  ? `SELECT ${taxonomyObservationSelectColumns}
                     FROM taxonomy_observations FINAL
                     WHERE organization_id = {organizationId:String}
                       AND project_id = {projectId:String}
                       AND ${validObservationIdClause}
                       AND observation_id IN (${memberIds})
                     ORDER BY start_time DESC, observation_id ASC
                     LIMIT {limit:UInt32}`
                  : `SELECT embedding, extracted_text, start_time
                     FROM taxonomy_facet_projections FINAL
                     WHERE organization_id = {organizationId:String}
                       AND project_id = {projectId:String}
                       AND facet_id = {facetId:String}
                       AND length(extracted_text) > 0
                       AND session_observation_id IN (${memberIds})
                     ORDER BY start_time DESC, session_observation_id ASC
                     LIMIT {limit:UInt32}`
              const result = await client.query({
                query,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  customBehaviorId: customBehaviorParam,
                  facetId: facetParam,
                  clusterId: clusterId as string,
                  limit,
                },
                format: "JSONEachRow",
              })
              if (facetParam === "") {
                const rows = await result.json<TaxonomyObservationRow>()
                return rows.map(toDomainObservation)
              }
              const rows = await result.json<{
                embedding: readonly number[]
                extracted_text: string
                start_time: string
              }>()
              return rows.map((row) => ({
                embedding: row.embedding,
                startTime: parseCHDate(row.start_time),
                projectionMetadata: { summary: row.extracted_text },
              }))
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "TaxonomyViewAssignmentRepository.listClusterMemberObservations"),
              ),
            )
        }),

      // Purge a cohort's edges across its topic slice AND every facet-scoped
      // slice applied to it, so deleting a cohort never orphans facet-scoped
      // edges (no `facet_id = ''` filter here).
      deleteByBehavior: ({ organizationId, projectId, customBehaviorId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client) => {
              await client.command({
                query: `DELETE FROM taxonomy_view_assignments
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND custom_behavior_id = {customBehaviorId:String}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  customBehaviorId: customBehaviorId as string,
                },
              })
            })
            .pipe(
              Effect.mapError((error) => toRepositoryError(error, "TaxonomyViewAssignmentRepository.deleteByBehavior")),
            )
        }),

      // Purge a facet's edges across every scope (whole-project + each cohort).
      deleteByFacet: ({ organizationId, projectId, facetId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client) => {
              await client.command({
                query: `DELETE FROM taxonomy_view_assignments
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND facet_id = {facetId:String}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  facetId: facetId as string,
                },
              })
            })
            .pipe(
              Effect.mapError((error) => toRepositoryError(error, "TaxonomyViewAssignmentRepository.deleteByFacet")),
            )
        }),
    }
  }),
)

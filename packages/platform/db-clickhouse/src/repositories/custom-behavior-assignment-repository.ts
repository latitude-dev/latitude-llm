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
  type CustomBehaviorAssignment,
  CustomBehaviorAssignmentRepository,
  customBehaviorAssignmentSchema,
} from "@domain/taxonomy"
import { Effect, Layer } from "effect"

const toClickhouseDateTime = (date: Date): string => date.toISOString().replace("Z", "")
const parseClickhouseDate = (value: string): Date => new Date(`${value.replace(" ", "T")}Z`)

type CustomBehaviorAssignmentRow = {
  readonly organization_id: string
  readonly project_id: string
  readonly custom_behavior_id: string
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

const toInsertRow = (assignment: CustomBehaviorAssignment) => ({
  organization_id: assignment.organizationId as string,
  project_id: assignment.projectId as string,
  custom_behavior_id: assignment.customBehaviorId as string,
  observation_id: assignment.observationId,
  session_id: assignment.sessionId as string,
  assigned_cluster_id: assignment.assignedClusterId ?? "",
  assignment_confidence: assignment.assignmentConfidence,
  assignment_method: assignment.assignmentMethod,
  reassignment_run_id: assignment.reassignmentRunId ?? "",
  start_time: toClickhouseDateTime(assignment.startTime),
  retention_days: assignment.retentionDays,
  indexed_at: toClickhouseDateTime(assignment.indexedAt),
})

const toDomain = (row: CustomBehaviorAssignmentRow): CustomBehaviorAssignment =>
  customBehaviorAssignmentSchema.parse({
    organizationId: OrganizationId(row.organization_id),
    projectId: ProjectId(row.project_id),
    customBehaviorId: row.custom_behavior_id,
    observationId: row.observation_id,
    sessionId: SessionId(row.session_id),
    assignedClusterId: row.assigned_cluster_id === "" ? null : TaxonomyClusterId(row.assigned_cluster_id),
    assignmentConfidence: row.assignment_confidence,
    assignmentMethod: row.assignment_method,
    reassignmentRunId: row.reassignment_run_id === "" ? null : TaxonomyRunId(row.reassignment_run_id),
    startTime: parseClickhouseDate(row.start_time),
    retentionDays: row.retention_days,
    indexedAt: parseClickhouseDate(row.indexed_at),
  })

export const CustomBehaviorAssignmentRepositoryLive = Layer.effect(
  CustomBehaviorAssignmentRepository,
  Effect.gen(function* () {
    return {
      upsertMany: (assignments) =>
        Effect.gen(function* () {
          if (assignments.length === 0) return
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client) => {
              await client.insert({
                table: "custom_behavior_assignments",
                values: assignments.map(toInsertRow),
                format: "JSONEachRow",
              })
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "CustomBehaviorAssignmentRepository.upsertMany")))
        }),

      listByBehavior: ({ organizationId, projectId, customBehaviorId, limit }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${selectColumns}
                        FROM custom_behavior_assignments FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND custom_behavior_id = {customBehaviorId:String}
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
              const rows = await result.json<CustomBehaviorAssignmentRow>()
              return rows.map(toDomain)
            })
            .pipe(
              Effect.mapError((error) => toRepositoryError(error, "CustomBehaviorAssignmentRepository.listByBehavior")),
            )
        }),

      getClusterAssignmentCounts: ({ organizationId, projectId, customBehaviorId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT assigned_cluster_id AS cluster_id, count() AS count
                        FROM custom_behavior_assignments FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND custom_behavior_id = {customBehaviorId:String}
                          AND assigned_cluster_id != ''
                        GROUP BY assigned_cluster_id
                        ORDER BY count DESC, assigned_cluster_id ASC`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  customBehaviorId: customBehaviorId as string,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<{ cluster_id: string; count: string | number }>()
              return rows.map((row) => ({ clusterId: TaxonomyClusterId(row.cluster_id), count: Number(row.count) }))
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "CustomBehaviorAssignmentRepository.getClusterAssignmentCounts"),
              ),
            )
        }),

      deleteByBehavior: ({ organizationId, projectId, customBehaviorId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client) => {
              await client.command({
                query: `DELETE FROM custom_behavior_assignments
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
              Effect.mapError((error) =>
                toRepositoryError(error, "CustomBehaviorAssignmentRepository.deleteByBehavior"),
              ),
            )
        }),
    }
  }),
)

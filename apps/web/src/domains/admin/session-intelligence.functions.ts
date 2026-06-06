import { getProjectDetailsUseCase } from "@domain/admin"
import { OrganizationId, ProjectId } from "@domain/shared"
import { SessionRepository } from "@domain/spans"
import { SessionRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { AdminProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getClickhouseClient, getWorkflowStarter } from "../../server/clients.ts"

const BACKFILL_SESSION_LIMIT = 1500
const BACKFILL_CONCURRENCY = 5

/**
 * Exported for input-schema tests.
 */
export const adminBackfillSessionIntelligenceInputSchema = z.object({
  projectId: z.string().min(1).max(256),
  confirmation: z.literal("reset session intelligence"),
})

interface AdminBackfillSessionIntelligenceResultDto {
  reset: true
  sessionLimit: number
  sessionsFound: number
  workflowsStarted: number
  workflowsAlreadyRunning: number
}

type ProjectResetTarget = {
  readonly organizationId: string
  readonly projectId: string
}

async function resetProjectTaxonomy({ organizationId, projectId }: ProjectResetTarget) {
  const adminPostgres = getAdminPostgresClient()
  const params = [organizationId, projectId]

  await adminPostgres.pool.query(
    `DELETE FROM latitude.taxonomy_cluster_lineage WHERE organization_id = $1 AND project_id = $2`,
    params,
  )
  await adminPostgres.pool.query(
    `DELETE FROM latitude.taxonomy_clusters WHERE organization_id = $1 AND project_id = $2`,
    params,
  )
  await adminPostgres.pool.query(
    `DELETE FROM latitude.taxonomy_runs WHERE organization_id = $1 AND project_id = $2`,
    params,
  )
  await adminPostgres.pool.query(
    `DELETE FROM latitude.calibration_profiles WHERE organization_id = $1 AND project_id = $2 AND scope = 'clustering'`,
    params,
  )
}

async function resetProjectSessionIntelligence({ organizationId, projectId }: ProjectResetTarget) {
  const clickhouse = getClickhouseClient()
  const queryParams = { organizationId, projectId }

  for (const table of [
    "session_moment_labels",
    "session_semantic_moments",
    "taxonomy_observations",
    "session_analyses",
  ] as const) {
    await clickhouse.command({
      query: `ALTER TABLE ${table} DELETE WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}`,
      query_params: queryParams,
      clickhouse_settings: { mutations_sync: "2" },
    })
    await clickhouse.command({ query: `OPTIMIZE TABLE ${table} FINAL` })
  }
}

/**
 * Dangerous backoffice operation: reset all taxonomy + session-intelligence
 * state for one project, then start AnalyzeSessionWorkflow for
 * the project's most recent sessions.
 *
 * Guard: {@link adminMiddleware}. The project organization is loaded from the
 * admin project repository so clients cannot choose an organization id. PG
 * resets run through the admin client (RLS bypass) and ClickHouse resets are
 * explicitly scoped by organization + project.
 */
export const adminBackfillSessionIntelligence = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminBackfillSessionIntelligenceInputSchema)
  .handler(async ({ data }): Promise<AdminBackfillSessionIntelligenceResultDto> => {
    const project = await Effect.runPromise(
      getProjectDetailsUseCase({ projectId: ProjectId(data.projectId) }).pipe(
        withPostgres(AdminProjectRepositoryLive, getAdminPostgresClient()),
        withTracing,
      ),
    )

    const target = { organizationId: project.organization.id, projectId: project.id }

    await resetProjectSessionIntelligence(target)
    await resetProjectTaxonomy(target)

    const sessions = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SessionRepository
        const page = yield* repository.listByProjectId({
          organizationId: OrganizationId(target.organizationId),
          projectId: ProjectId(target.projectId),
          options: { limit: BACKFILL_SESSION_LIMIT, sortBy: "lastActivity", sortDirection: "desc" },
        })
        return page.items.filter((session) => session.traceIds.length > 0)
      }).pipe(withClickHouse(SessionRepositoryLive, getClickhouseClient(), OrganizationId(target.organizationId))),
    )

    const workflowStarter = await getWorkflowStarter()
    let workflowsStarted = 0
    let workflowsAlreadyRunning = 0

    await Effect.runPromise(
      Effect.forEach(
        sessions,
        (session) => {
          const workflowId = `org:${target.organizationId}:conversation-intelligence:analyzeSession:${target.projectId}:${session.sessionId}`
          return workflowStarter
            .start(
              "analyzeSessionWorkflow",
              {
                organizationId: target.organizationId,
                projectId: target.projectId,
                sessionId: session.sessionId,
                triggeringTraceId: session.traceIds[0] ?? session.sessionId,
                triggeringStartTime: session.startTime.toISOString(),
                reason: "backfill",
              },
              { workflowId },
            )
            .pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  workflowsStarted += 1
                }),
              ),
              Effect.catchTag("WorkflowAlreadyStartedError", () =>
                Effect.sync(() => {
                  workflowsAlreadyRunning += 1
                }),
              ),
            )
        },
        { concurrency: BACKFILL_CONCURRENCY, discard: true },
      ).pipe(withTracing),
    )

    return {
      reset: true,
      sessionLimit: BACKFILL_SESSION_LIMIT,
      sessionsFound: sessions.length,
      workflowsStarted,
      workflowsAlreadyRunning,
    }
  })

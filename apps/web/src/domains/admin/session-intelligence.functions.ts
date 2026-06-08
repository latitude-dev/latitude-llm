import { getProjectDetailsUseCase } from "@domain/admin"
import { ProjectId } from "@domain/shared"
import { AdminProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getWorkflowStarter } from "../../server/clients.ts"

const BACKFILL_SESSION_LIMIT = 1500

/**
 * Exported for input-schema tests.
 */
export const adminBackfillSessionIntelligenceInputSchema = z.object({
  projectId: z.string().min(1).max(256),
  confirmation: z.literal("reset session intelligence"),
})

interface AdminBackfillSessionIntelligenceResultDto {
  queued: true
  sessionLimit: number
}

/**
 * Dangerous backoffice operation: start a Temporal orchestration that resets
 * all taxonomy + session-intelligence state for one project, starts
 * AnalyzeSessionWorkflow for recent sessions, then gardens taxonomy.
 *
 * Guard: {@link adminMiddleware}. The project organization is loaded from the
 * admin project repository so clients cannot choose an organization id. Heavy
 * reset, child workflow fan-out, waiting, and gardening run in Temporal so the
 * modal request returns after authorization + workflow start.
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

    const workflowStarter = await getWorkflowStarter()
    await Effect.runPromise(
      workflowStarter
        .start(
          "backfillSessionIntelligenceWorkflow",
          { ...target, sessionLimit: BACKFILL_SESSION_LIMIT, reason: "backoffice" },
          {
            workflowId: `org:${target.organizationId}:conversation-intelligence:backfillSessionIntelligence:${target.projectId}`,
          },
        )
        .pipe(Effect.catchTag("WorkflowAlreadyStartedError", () => Effect.void))
        .pipe(withTracing),
    )

    return {
      queued: true,
      sessionLimit: BACKFILL_SESSION_LIMIT,
    }
  })

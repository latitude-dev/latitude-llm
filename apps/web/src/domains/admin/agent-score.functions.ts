import { getProjectDetailsUseCase } from "@domain/admin"
import { ProjectId } from "@domain/shared"
import { AdminProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getQueuePublisher } from "../../server/clients.ts"

/** Exported for input-schema tests. */
export const adminRecalculateAgentScoreInputSchema = z.object({
  projectId: z.string().min(1).max(256),
})

/**
 * Recompute one project's Agent Score now, without waiting for the daily sweep.
 *
 * The run is forced, so it recomputes a date that already has a snapshot. That is the point: the
 * expensive half of the work is the explanation — every session in the window, read with its
 * content — and this is how staff refresh it after a detector, a signal or a flagger setting
 * changes, rather than waiting a day to see the effect.
 *
 * It cannot rewrite a published score. The worker's insert is conditional on the date being absent,
 * so a forced run on a scored day refreshes the evidence and leaves the number exactly as it was:
 * a stored score records what was published that day, and staff curiosity is not a reason to edit
 * history. A day with no score can still gain one, which is the useful case after a backfill.
 *
 * The organization comes from the project lookup rather than the caller, so a request cannot name a
 * tenant it has nothing to do with.
 */
export const adminRecalculateAgentScore = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminRecalculateAgentScoreInputSchema)
  .handler(async ({ data }): Promise<{ enqueued: true; date: string }> => {
    const project = await Effect.runPromise(
      getProjectDetailsUseCase({ projectId: ProjectId(data.projectId) }).pipe(
        withPostgres(AdminProjectRepositoryLive, getAdminPostgresClient()),
        withTracing,
      ),
    )

    const date = new Date().toISOString().slice(0, 10)
    const publisher = await getQueuePublisher()
    await Effect.runPromise(
      publisher
        .publish("agent-score", "snapshotProject", {
          organizationId: project.organization.id,
          projectId: project.id,
          date,
          force: true,
        })
        .pipe(withTracing),
    )

    return { enqueued: true, date }
  })

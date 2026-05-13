import { getProjectDetailsUseCase } from "@domain/admin"
import { ProjectId } from "@domain/shared"
import { WRAPPED_REPORT_TYPES } from "@domain/spans"
import { AdminProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getQueuePublisher } from "../../server/clients.ts"

const WINDOW_DURATION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Exported for input-schema tests.
 */
export const adminTriggerWrappedInputSchema = z.object({
  projectId: z.string().min(1).max(256),
  type: z.enum(WRAPPED_REPORT_TYPES).default("claude_code"),
})

/**
 * Manually trigger the Wrapped pipeline for a single project + type.
 *
 * Looks up the project's organization (so the client can't claim an orgId it
 * doesn't own), then publishes a `runForProject` task on the `wrapped` topic
 * with the requested type. Today only `claude_code` is wired up.
 *
 * No BullMQ `dedupeKey` is set: an earlier version date-keyed the publish so
 * repeated clicks collapsed into one job, but that also blocked legitimate
 * retries after a failed run (BullMQ leaves the failed jobId "burned" until
 * removed). Staff-driven manual clicks are infrequent enough that duplicate
 * publishes aren't a real concern.
 *
 * The worker is the single source of truth for the feature-flag gate — this
 * handler does NOT pre-check the flag. If the flag is off the worker simply
 * skips (logged as `flag-off`).
 */
export const adminTriggerWrapped = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminTriggerWrappedInputSchema)
  .handler(async ({ data }): Promise<{ enqueued: true }> => {
    const project = await Effect.runPromise(
      getProjectDetailsUseCase({ projectId: ProjectId(data.projectId) }).pipe(
        withPostgres(AdminProjectRepositoryLive, getAdminPostgresClient()),
        withTracing,
      ),
    )

    const now = new Date()
    const windowStart = new Date(now.getTime() - WINDOW_DURATION_MS)
    const windowStartIso = windowStart.toISOString()
    const windowEndIso = now.toISOString()

    const publisher = await getQueuePublisher()
    await Effect.runPromise(
      publisher
        .publish("wrapped", "runForProject", {
          type: data.type,
          organizationId: project.organization.id,
          projectId: project.id,
          windowStartIso,
          windowEndIso,
        })
        .pipe(withTracing),
    )

    return { enqueued: true }
  })

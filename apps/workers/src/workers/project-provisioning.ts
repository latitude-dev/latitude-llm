import type { QueueConsumer } from "@domain/queue"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { provisionSystemQueues } from "../services/provisioning.ts"

const logger = createLogger("project-provisioning")

interface ProjectProvisioningDeps {
  consumer: QueueConsumer
}

/**
 * Handles project provisioning by creating default system annotation queues.
 *
 * This worker listens for ProjectCreated events and idempotently provisions
 * the default set of system annotation queues for the new project.
 */
export const createProjectProvisioningWorker = ({ consumer }: ProjectProvisioningDeps) => {
  consumer.subscribe("project-provisioning", {
    provision: (payload) =>
      Effect.gen(function* () {
        const startTime = Date.now()

        const results = yield* Effect.promise(() =>
          provisionSystemQueues({
            organizationId: payload.organizationId,
            projectId: payload.projectId,
          }),
        )

        logger.info("Project provisioning completed", {
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          durationMs: Date.now() - startTime,
          queuesProvisioned: results.length,
          results: results.map((r) => r.queueSlug),
        })
      }),
  })
}

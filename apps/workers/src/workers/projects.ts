import type { QueueConsumer } from "@domain/queue"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { provisionSystemQueues } from "../services/provisioning.ts"

const logger = createLogger("projects")

interface ProjectsDeps {
  consumer: QueueConsumer
}

export const createProjectsWorker = ({ consumer }: ProjectsDeps) => {
  consumer.subscribe("projects", {
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

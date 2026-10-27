import type { QueueConsumer, WorkflowStarterShape } from "@domain/queue"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("trace-deletions")

interface TraceDeletionsDeps {
  consumer: QueueConsumer
  workflowStarter: WorkflowStarterShape
}

export const createTraceDeletionsWorker = ({ consumer, workflowStarter }: TraceDeletionsDeps) => {
  consumer.subscribe("trace-deletions", {
    run: (payload) => {
      const workflowId = `trace-deletion:${payload.traceDeletionRequestId}`

      return workflowStarter.start("deleteTracesWorkflow", payload, { workflowId }).pipe(
        Effect.catchTag("WorkflowAlreadyStartedError", () =>
          Effect.sync(() => logger.info("Trace deletion workflow already running", { ...payload, workflowId })),
        ),
        Effect.asVoid,
        withTracing,
      )
    },
  })
}

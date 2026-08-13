import type { QueueConsumer, WorkflowStarterShape } from "@domain/queue"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("flagger-screening")
const QUEUE = "flagger-screening" as const
const START_TASK = "start" as const

interface StartPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly analysisHash: string
}

type FlaggerScreeningLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface FlaggerScreeningDeps {
  consumer: QueueConsumer
  workflowStarter: WorkflowStarterShape
  logger?: FlaggerScreeningLogger
}

const buildLogContext = (payload: StartPayload) => ({
  queue: QUEUE,
  task: START_TASK,
  organizationId: payload.organizationId,
  projectId: payload.projectId,
  sessionId: payload.sessionId,
  analysisHash: payload.analysisHash,
})

/**
 * Thin BullMQ→Temporal starter: transient Temporal unavailability retries here
 * instead of failing the moments persist. The workflow id embeds the analysis
 * hash so each session generation screens exactly once.
 */
export const createFlaggerScreeningWorker = ({
  consumer,
  workflowStarter,
  logger: injectedLogger,
}: FlaggerScreeningDeps) => {
  const log = injectedLogger ?? logger

  consumer.subscribe(QUEUE, {
    start: (payload: StartPayload) =>
      workflowStarter
        .start(
          "flaggerScreeningWorkflow",
          {
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            sessionId: payload.sessionId,
            analysisHash: payload.analysisHash,
          },
          {
            workflowId: `flagger-screening:${payload.sessionId}:${payload.analysisHash.slice(0, 16)}`,
          },
        )
        .pipe(
          withTracing,
          Effect.tap(() =>
            Effect.sync(() =>
              log.info("Started flagger screening workflow", {
                ...buildLogContext(payload),
              }),
            ),
          ),
          Effect.tapError((error) =>
            Effect.sync(() =>
              log.error("Failed to start flagger screening workflow", {
                ...buildLogContext(payload),
                error,
              }),
            ),
          ),
          Effect.asVoid,
        ),
  })
}

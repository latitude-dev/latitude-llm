import type { QueueConsumer, WorkflowStarterShape } from "@domain/queue"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("start-flagger-workflow")
const QUEUE = "start-flagger-workflow" as const
const START_TASK = "start" as const

interface StartPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
  readonly reason: "sampled" | "ambiguous"
}

type StartFlaggerWorkflowLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface StartFlaggerWorkflowDeps {
  consumer: QueueConsumer
  workflowStarter: WorkflowStarterShape
  logger?: StartFlaggerWorkflowLogger
}

const buildLogContext = (payload: StartPayload) => ({
  queue: QUEUE,
  task: START_TASK,
  organizationId: payload.organizationId,
  projectId: payload.projectId,
  traceId: payload.traceId,
  queueSlug: payload.queueSlug,
  reason: payload.reason,
})

/**
 * Thin worker that calls `workflowStarter.start(...)` for the system-queue
 * flagger workflow. Kept separate from the deterministic fan-out so transient
 * Temporal unavailability retries here with bounded BullMQ backoff (see
 * `attempts`/`backoff` in the publisher call in `deterministic-flaggers.ts`)
 * instead of re-running every strategy.
 *
 * After `attempts` are exhausted the job is failed and logged.
 * TODO: send exhausted jobs to a DLQ with alerting so a prolonged Temporal
 *       outage is visible beyond log search.
 */
export const createStartFlaggerWorkflowWorker = ({
  consumer,
  workflowStarter,
  logger: injectedLogger,
}: StartFlaggerWorkflowDeps) => {
  const log = injectedLogger ?? logger

  consumer.subscribe(QUEUE, {
    start: (payload: StartPayload) =>
      workflowStarter
        .start(
          "systemQueueFlaggerWorkflow",
          {
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            traceId: payload.traceId,
            queueSlug: payload.queueSlug,
          },
          {
            workflowId: `system-queue-flagger:${payload.traceId}:${payload.queueSlug}`,
          },
        )
        .pipe(
          withTracing,
          Effect.tap(() =>
            Effect.sync(() =>
              log.info("Started system-queue flagger workflow", {
                ...buildLogContext(payload),
              }),
            ),
          ),
          Effect.tapError((error) =>
            Effect.sync(() =>
              log.error("Failed to start system-queue flagger workflow", {
                ...buildLogContext(payload),
                error,
              }),
            ),
          ),
          Effect.asVoid,
        ),
  })
}

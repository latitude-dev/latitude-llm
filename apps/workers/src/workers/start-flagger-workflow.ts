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
  readonly flaggerId: string
  readonly flaggerSlug: string
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
  flaggerId: payload.flaggerId,
  flaggerSlug: payload.flaggerSlug,
  reason: payload.reason,
})

/**
 * Thin worker that calls `workflowStarter.start(...)` for the flagger workflow.
 * Kept separate from the deterministic fan-out so transient Temporal
 * unavailability retries here with bounded BullMQ backoff (see
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
          "flaggerWorkflow",
          {
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            traceId: payload.traceId,
            flaggerId: payload.flaggerId,
            flaggerSlug: payload.flaggerSlug,
          },
          {
            workflowId: `flagger:${payload.traceId}:${payload.flaggerSlug}`,
          },
        )
        .pipe(
          withTracing,
          Effect.tap(() =>
            Effect.sync(() =>
              log.info("Started flagger workflow", {
                ...buildLogContext(payload),
              }),
            ),
          ),
          Effect.tapError((error) =>
            Effect.sync(() =>
              log.error("Failed to start flagger workflow", {
                ...buildLogContext(payload),
                error,
              }),
            ),
          ),
          Effect.asVoid,
        ),
  })
}

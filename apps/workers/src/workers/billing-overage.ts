import type { QueueConsumer, WorkflowStarterShape } from "@domain/queue"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("billing-overage")
const QUEUE = "billing-overage" as const
const TASK = "reportOverage" as const

interface BillingOverageDeps {
  consumer: QueueConsumer
  workflowStarter: WorkflowStarterShape
}

interface ReportOveragePayload {
  readonly organizationId: string
  readonly periodStart: string
  readonly periodEnd: string
  readonly snapshotOverageCredits: number
}

const buildWorkflowId = (payload: ReportOveragePayload) =>
  `billing-overage:${payload.organizationId}:${payload.periodStart}:${payload.periodEnd}:${payload.snapshotOverageCredits}`

export const createBillingOverageWorker = ({ consumer, workflowStarter }: BillingOverageDeps) => {
  consumer.subscribe(QUEUE, {
    [TASK]: (payload: ReportOveragePayload) => {
      const workflowId = buildWorkflowId(payload)

      return workflowStarter.start("billingOverageWorkflow", payload, { workflowId }).pipe(
        Effect.catchTag("WorkflowAlreadyStartedError", () =>
          Effect.sync(() =>
            logger.info("Skipping billing overage workflow start: already running", {
              organizationId: payload.organizationId,
              periodStart: payload.periodStart,
              periodEnd: payload.periodEnd,
              snapshotOverageCredits: payload.snapshotOverageCredits,
              workflowId,
            }),
          ),
        ),
        Effect.tap(() =>
          Effect.sync(() =>
            logger.info("Started billing overage workflow", {
              organizationId: payload.organizationId,
              periodStart: payload.periodStart,
              periodEnd: payload.periodEnd,
              snapshotOverageCredits: payload.snapshotOverageCredits,
              workflowId,
            }),
          ),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error("Failed to start billing overage workflow", {
              organizationId: payload.organizationId,
              periodStart: payload.periodStart,
              periodEnd: payload.periodEnd,
              snapshotOverageCredits: payload.snapshotOverageCredits,
              workflowId,
              error,
            }),
          ),
        ),
        Effect.asVoid,
        withTracing,
      )
    },
  })
}

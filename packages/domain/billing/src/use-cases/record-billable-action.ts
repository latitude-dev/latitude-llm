import { QueuePublisher } from "@domain/queue"
import type { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import type { ChargeableAction } from "../constants.ts"
import { recordUsageEventUseCase } from "./record-usage-event.ts"
import type { AuthorizedBillableActionContext } from "./authorize-billable-action.ts"

const BILLING_OVERAGE_SYNC_THROTTLE_MS = 5_000

export interface RecordBillableActionInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly action: ChargeableAction
  readonly idempotencyKey: string
  readonly context: AuthorizedBillableActionContext
  readonly traceId?: TraceId | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export const recordBillableActionUseCase = Effect.fn("billing.recordBillableAction")(function* (
  input: RecordBillableActionInput,
) {
  yield* Effect.annotateCurrentSpan("billing.action", input.action)
  yield* Effect.annotateCurrentSpan("billing.idempotencyKey", input.idempotencyKey)

  const updated = yield* recordUsageEventUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
    action: input.action,
    idempotencyKey: input.idempotencyKey,
    planSlug: input.context.planSlug,
    periodStart: input.context.periodStart,
    periodEnd: input.context.periodEnd,
    includedCredits: input.context.includedCredits,
    traceId: input.traceId,
    metadata: input.metadata,
  })

  if (
    input.context.planSource === "subscription" &&
    input.context.overageAllowed &&
    updated.overageCredits > updated.reportedOverageCredits
  ) {
    const queuePublisher = yield* QueuePublisher
    yield* queuePublisher
      .publish(
        "billing",
        "reportOverage",
        {
          organizationId: input.organizationId,
          periodStart: updated.periodStart.toISOString(),
          periodEnd: updated.periodEnd.toISOString(),
        },
        {
          dedupeKey: `billing:reportOverage:${input.organizationId}:${updated.periodStart.toISOString()}:${updated.overageCredits}`,
          throttleMs: BILLING_OVERAGE_SYNC_THROTTLE_MS,
          attempts: 10,
          backoff: { type: "exponential", delayMs: 1_000 },
        },
      )
      .pipe(Effect.ignore)
  }

  return updated
})

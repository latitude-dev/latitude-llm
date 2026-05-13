import type { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import type { ChargeableAction } from "../constants.ts"
import type { AuthorizedBillableActionContext } from "./authorize-billable-action.ts"
import { recordUsageEventUseCase } from "./record-usage-event.ts"

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
    planSource: input.context.planSource,
    periodStart: input.context.periodStart,
    periodEnd: input.context.periodEnd,
    includedCredits: input.context.includedCredits,
    overageAllowed: input.context.overageAllowed,
    traceId: input.traceId,
    metadata: input.metadata,
  })

  return updated
})

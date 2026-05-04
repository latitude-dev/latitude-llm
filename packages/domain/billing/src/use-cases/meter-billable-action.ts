import { QueuePublisher } from "@domain/queue"
import type { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import type { ChargeableAction } from "../constants.ts"
import { BillingUsagePeriodRepository } from "../ports/billing-usage-period-repository.ts"
import { recordUsageEventUseCase } from "./record-usage-event.ts"
import { resolveEffectivePlan } from "./resolve-effective-plan.ts"

const log = createLogger("billing")
const BILLING_OVERAGE_SYNC_THROTTLE_MS = 5_000

export interface MeterBillableActionInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly action: ChargeableAction
  readonly idempotencyKey: string
  readonly traceId?: TraceId | undefined
  readonly metadata?: Record<string, unknown> | undefined
  readonly skipIfBlocked?: boolean | undefined
}

export interface MeterBillableActionResult {
  readonly allowed: boolean
  readonly period: {
    start: Date
    end: Date
    includedCredits: number
    consumedCredits: number
    overageCredits: number
  } | null
}

export const meterBillableAction = Effect.fn("billing.meterBillableAction")(function* (
  input: MeterBillableActionInput,
) {
  yield* Effect.annotateCurrentSpan("billing.action", input.action)
  yield* Effect.annotateCurrentSpan("billing.idempotencyKey", input.idempotencyKey)

  const orgPlan = yield* resolveEffectivePlan(input.organizationId)

  if (input.skipIfBlocked && orgPlan.plan.hardCapped) {
    const periodRepo = yield* BillingUsagePeriodRepository
    const current = yield* periodRepo.findByPeriod({
      organizationId: input.organizationId,
      periodStart: orgPlan.periodStart,
      periodEnd: orgPlan.periodEnd,
    })
    const consumed = current?.consumedCredits ?? 0
    if (consumed >= orgPlan.plan.includedCredits) {
      return {
        allowed: false,
        period: current
          ? {
              start: current.periodStart,
              end: current.periodEnd,
              includedCredits: current.includedCredits,
              consumedCredits: current.consumedCredits,
              overageCredits: current.overageCredits,
            }
          : null,
      }
    }
  }

  const updated = yield* recordUsageEventUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
    action: input.action,
    idempotencyKey: input.idempotencyKey,
    planSlug: orgPlan.plan.slug,
    periodStart: orgPlan.periodStart,
    periodEnd: orgPlan.periodEnd,
    includedCredits: orgPlan.plan.includedCredits,
    traceId: input.traceId,
    metadata: input.metadata,
  }).pipe(
    Effect.catchTag("UsageEventAlreadyRecordedError", () =>
      Effect.gen(function* () {
        const periodRepo = yield* BillingUsagePeriodRepository
        const current = yield* periodRepo.findByPeriod({
          organizationId: input.organizationId,
          periodStart: orgPlan.periodStart,
          periodEnd: orgPlan.periodEnd,
        })
        return (
          current ?? {
            organizationId: input.organizationId,
            planSlug: orgPlan.plan.slug,
            periodStart: orgPlan.periodStart,
            periodEnd: orgPlan.periodEnd,
            includedCredits: orgPlan.plan.includedCredits,
            consumedCredits: 0,
            overageCredits: 0,
            reportedOverageCredits: 0,
            overageAmountMicrocents: 0,
            updatedAt: new Date(),
          }
        )
      }),
    ),
  )

  if (
    orgPlan.source === "subscription" &&
    orgPlan.plan.overageAllowed &&
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
          dedupeKey: `billing:reportOverage:${input.organizationId}:${updated.periodStart.toISOString()}`,
          throttleMs: BILLING_OVERAGE_SYNC_THROTTLE_MS,
          attempts: 10,
          backoff: { type: "exponential", delayMs: 1_000 },
        },
      )
      .pipe(
        Effect.tapError((error) =>
          Effect.sync(() =>
            log.warn("Failed to enqueue billing overage sync", {
              organizationId: input.organizationId,
              periodStart: updated.periodStart.toISOString(),
              periodEnd: updated.periodEnd.toISOString(),
              error,
            }),
          ),
        ),
        Effect.ignore,
      )
  }

  return {
    allowed: true,
    period: {
      start: updated.periodStart,
      end: updated.periodEnd,
      includedCredits: updated.includedCredits,
      consumedCredits: updated.consumedCredits,
      overageCredits: updated.overageCredits,
    },
  }
})

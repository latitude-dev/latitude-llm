import { QueuePublisher } from "@domain/queue"
import type { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { generateId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { ACTION_CREDITS, buildBillingIdempotencyKey, persistedIncludedCreditsForPlan } from "../constants.ts"
import type { BillingUsageEvent } from "../entities/billing-usage-event.ts"
import type { BillingUsagePeriod } from "../entities/billing-usage-period.ts"
import { BillingUsageEventRepository } from "../ports/billing-usage-event-repository.ts"
import { BillingUsagePeriodRepository } from "../ports/billing-usage-period-repository.ts"

const BILLING_OVERAGE_SYNC_THROTTLE_MS = 5_000

export interface RecordTraceUsageBatchInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceIds: readonly TraceId[]
  readonly planSlug: BillingUsagePeriod["planSlug"]
  readonly planSource: "override" | "subscription" | "free-fallback"
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly includedCredits: number
  readonly overageAllowed: boolean
}

const emptyPeriod = (input: RecordTraceUsageBatchInput): BillingUsagePeriod => ({
  organizationId: input.organizationId,
  planSlug: input.planSlug,
  periodStart: input.periodStart,
  periodEnd: input.periodEnd,
  includedCredits: persistedIncludedCreditsForPlan(input.planSlug, input.includedCredits),
  consumedCredits: 0,
  overageCredits: 0,
  reportedOverageCredits: 0,
  overageAmountMicrocents: 0,
  updatedAt: new Date(),
})

export const recordTraceUsageBatchUseCase = Effect.fn("billing.recordTraceUsageBatch")(function* (
  input: RecordTraceUsageBatchInput,
) {
  yield* Effect.annotateCurrentSpan("billing.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("billing.action", "trace")
  yield* Effect.annotateCurrentSpan("billing.traceCount", input.traceIds.length)

  const sqlClient = yield* SqlClient
  const eventRepo = yield* BillingUsageEventRepository
  const periodRepo = yield* BillingUsagePeriodRepository

  const uniqueTraceIds = [...new Set(input.traceIds)]
  if (uniqueTraceIds.length === 0) {
    const current = yield* periodRepo.findByPeriod({
      organizationId: input.organizationId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    })
    return current ?? emptyPeriod(input)
  }

  const updated = yield* sqlClient.transaction(
    Effect.gen(function* () {
      const now = new Date()
      const events: BillingUsageEvent[] = uniqueTraceIds.map((traceId) => ({
        id: generateId(),
        organizationId: input.organizationId,
        projectId: input.projectId,
        action: "trace",
        credits: ACTION_CREDITS.trace,
        idempotencyKey: buildBillingIdempotencyKey("trace", [input.organizationId, input.projectId, traceId]),
        traceId,
        metadata: undefined,
        happenedAt: now,
        billingPeriodStart: input.periodStart,
        billingPeriodEnd: input.periodEnd,
      }))
      const insertedCount = yield* eventRepo.insertMany(events)

      if (insertedCount === 0) {
        const current = yield* periodRepo.findByPeriod({
          organizationId: input.organizationId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        })
        return current ?? emptyPeriod(input)
      }

      return yield* periodRepo.appendCreditsForBillingPeriod({
        organizationId: input.organizationId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        planSlug: input.planSlug,
        persistedIncludedCredits: persistedIncludedCreditsForPlan(input.planSlug, input.includedCredits),
        creditsDelta: insertedCount * ACTION_CREDITS.trace,
      })
    }),
  )

  if (
    input.planSource === "subscription" &&
    input.overageAllowed &&
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

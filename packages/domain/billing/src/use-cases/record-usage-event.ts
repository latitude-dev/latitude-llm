import { OutboxEventWriter } from "@domain/events"
import type { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { generateId, SqlClient, toRepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { ACTION_CREDITS, type ChargeableAction, persistedIncludedCreditsForPlan } from "../constants.ts"
import type { BillingUsageEvent } from "../entities/billing-usage-event.ts"
import type { BillingUsagePeriod } from "../entities/billing-usage-period.ts"
import { BillingUsageEventRepository } from "../ports/billing-usage-event-repository.ts"
import { BillingUsagePeriodRepository } from "../ports/billing-usage-period-repository.ts"

export interface RecordUsageEventInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly action: ChargeableAction
  readonly idempotencyKey: string
  readonly planSlug: BillingUsagePeriod["planSlug"]
  readonly planSource: "override" | "subscription" | "free-fallback"
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly includedCredits: number
  readonly overageAllowed: boolean
  readonly traceId?: TraceId | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

const buildEmptyUsagePeriod = (input: RecordUsageEventInput): BillingUsagePeriod => ({
  organizationId: input.organizationId,
  planSlug: input.planSlug,
  periodStart: input.periodStart,
  periodEnd: input.periodEnd,
  includedCredits: persistedIncludedCreditsForPlan(input.planSlug, input.includedCredits),
  consumedCredits: 0,
  overageCredits: 0,
  reportedOverageCredits: 0,
  overageAmountMills: 0,
  updatedAt: new Date(),
})

const loadCurrentOrEmptyUsagePeriod = Effect.fn("billing.loadCurrentOrEmptyUsagePeriod")(function* (
  input: RecordUsageEventInput,
) {
  const periodRepo = yield* BillingUsagePeriodRepository
  const period = yield* periodRepo.findOptionalByPeriod({
    organizationId: input.organizationId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  })

  return period ?? buildEmptyUsagePeriod(input)
})

export const recordUsageEventUseCase = Effect.fn("billing.recordUsageEvent")(function* (input: RecordUsageEventInput) {
  yield* Effect.annotateCurrentSpan("billing.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("billing.action", input.action)
  yield* Effect.annotateCurrentSpan("billing.idempotencyKey", input.idempotencyKey)

  const eventRepo = yield* BillingUsageEventRepository
  const outboxEventWriter = yield* OutboxEventWriter
  const periodRepo = yield* BillingUsagePeriodRepository
  const sqlClient = yield* SqlClient

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const credits = ACTION_CREDITS[input.action]
      const now = new Date()
      const persistedIncludedCredits = persistedIncludedCreditsForPlan(input.planSlug, input.includedCredits)

      const event: BillingUsageEvent = {
        id: generateId(),
        organizationId: input.organizationId,
        projectId: input.projectId,
        action: input.action,
        credits,
        idempotencyKey: input.idempotencyKey,
        traceId: input.traceId,
        metadata: input.metadata,
        happenedAt: now,
        billingPeriodStart: input.periodStart,
        billingPeriodEnd: input.periodEnd,
      }

      const inserted = yield* eventRepo.insertIfAbsent(event)
      if (!inserted) {
        return yield* loadCurrentOrEmptyUsagePeriod(input)
      }

      const updated = yield* periodRepo.appendCreditsForBillingPeriod({
        organizationId: input.organizationId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        planSlug: input.planSlug,
        persistedIncludedCredits,
        creditsDelta: credits,
      })

      yield* outboxEventWriter
        .write({
          eventName: "BillingUsagePeriodUpdated",
          aggregateType: "billing-usage-period",
          aggregateId: input.organizationId,
          organizationId: input.organizationId,
          payload: {
            organizationId: input.organizationId,
            periodStart: updated.periodStart.toISOString(),
            periodEnd: updated.periodEnd.toISOString(),
            planSource: input.planSource,
            overageAllowed: input.overageAllowed,
            includedCredits: updated.includedCredits,
            consumedCredits: updated.consumedCredits,
            overageCredits: updated.overageCredits,
            reportedOverageCredits: updated.reportedOverageCredits,
          },
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "outbox.writeBillingUsagePeriodUpdated")))

      return updated
    }),
  )
})

import type { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { generateId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import {
  ACTION_CREDITS,
  type ChargeableAction,
  calculateOverageAmountMicrocents,
  persistedIncludedCreditsForPlan,
} from "../constants.ts"
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
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly includedCredits: number
  readonly traceId?: TraceId | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export const recordUsageEventUseCase = Effect.fn("billing.recordUsageEvent")(function* (input: RecordUsageEventInput) {
  yield* Effect.annotateCurrentSpan("billing.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("billing.action", input.action)
  yield* Effect.annotateCurrentSpan("billing.idempotencyKey", input.idempotencyKey)

  const eventRepo = yield* BillingUsageEventRepository
  const periodRepo = yield* BillingUsagePeriodRepository
  const sqlClient = yield* SqlClient

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const existing = yield* eventRepo.findByKey(input.idempotencyKey)
      if (existing) {
        const period = yield* periodRepo.findByPeriod({
          organizationId: input.organizationId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        })
        return (
          period ?? {
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
          }
        )
      }

      const credits = ACTION_CREDITS[input.action]
      const now = new Date()

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

      yield* eventRepo.insert(event)

      const persistedIncludedCredits = persistedIncludedCreditsForPlan(input.planSlug, input.includedCredits)

      return yield* periodRepo.appendCreditsForBillingPeriod({
        organizationId: input.organizationId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        planSlug: input.planSlug,
        persistedIncludedCredits,
        creditsDelta: credits,
      })
    }),
  )
})

export interface CheckCreditAvailabilityInput {
  readonly organizationId: OrganizationId
  readonly action: ChargeableAction
  readonly planSlug: BillingUsagePeriod["planSlug"]
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly includedCredits: number
  readonly hardCapped: boolean
  readonly priceCents: number | null
  readonly spendingLimitCents: number | null
}

export const checkCreditAvailabilityUseCase = Effect.fn("billing.checkCreditAvailability")(function* (
  input: CheckCreditAvailabilityInput,
) {
  const credits = ACTION_CREDITS[input.action]
  const periodRepo = yield* BillingUsagePeriodRepository
  const period = yield* periodRepo.findByPeriod({
    organizationId: input.organizationId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  })

  if (input.hardCapped) {
    if (!period) return input.includedCredits >= credits

    if (period.consumedCredits + credits > input.includedCredits) {
      return false
    }
  }

  if (input.spendingLimitCents === null || input.priceCents === null) {
    return true
  }

  const projectedConsumed = (period?.consumedCredits ?? 0) + credits
  const projectedOverage = Math.max(projectedConsumed - input.includedCredits, 0)
  const projectedOverageAmountMicrocents = calculateOverageAmountMicrocents(input.planSlug, projectedOverage)
  const projectedSpendMicrocents = input.priceCents * 1_000_000 + projectedOverageAmountMicrocents

  return projectedSpendMicrocents <= input.spendingLimitCents * 1_000_000
})

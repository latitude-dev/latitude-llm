import type { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import { ACTION_CREDITS, CENT_TO_MILLS, type ChargeableAction, calculateOverageAmountMills } from "../constants.ts"
import type { BillingUsagePeriod } from "../entities/billing-usage-period.ts"
import { BillingUsagePeriodRepository } from "../ports/billing-usage-period-repository.ts"

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
  const period = yield* periodRepo.findOptionalByPeriod({
    organizationId: input.organizationId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  })

  if (input.hardCapped) {
    const consumedCredits = period?.consumedCredits ?? 0
    if (consumedCredits + credits > input.includedCredits) {
      return false
    }
  }

  if (input.spendingLimitCents === null || input.priceCents === null) {
    return true
  }

  const projectedConsumedCredits = (period?.consumedCredits ?? 0) + credits
  const projectedOverageCredits = Math.max(projectedConsumedCredits - input.includedCredits, 0)
  const projectedOverageAmountMills = calculateOverageAmountMills(input.planSlug, projectedOverageCredits)
  const projectedSpendMills = input.priceCents * CENT_TO_MILLS + projectedOverageAmountMills

  return projectedSpendMills <= input.spendingLimitCents * CENT_TO_MILLS
})

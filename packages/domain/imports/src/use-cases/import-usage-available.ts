import {
  ACTION_CREDITS,
  BillingUsagePeriodRepository,
  calculateMaxAllowedConsumedCreditsForCap,
  type EffectivePlanResolution,
} from "@domain/billing"
import { Effect } from "effect"

/**
 * How many traces this period can still bill. `null` when billing does not cap trace volume
 * (enterprise and plans without a spending limit).
 */
export const importTraceBudget = (plan: EffectivePlanResolution) =>
  Effect.gen(function* () {
    const periodRepo = yield* BillingUsagePeriodRepository
    const period = yield* periodRepo.findOptionalByPeriod({
      organizationId: plan.organizationId,
      periodStart: plan.periodStart,
      periodEnd: plan.periodEnd,
    })
    return tracesRemainingForPlan(plan, period?.consumedCredits ?? 0)
  })

const tracesRemainingForPlan = (plan: EffectivePlanResolution, consumedCredits: number): number | null => {
  if (plan.plan.hardCapped) {
    const remainingCredits = Math.max(plan.plan.includedCredits - consumedCredits, 0)
    return Math.floor(remainingCredits / ACTION_CREDITS.trace)
  }

  if (plan.plan.spendingLimitCents !== null && plan.plan.priceCents !== null) {
    const maxAllowed = calculateMaxAllowedConsumedCreditsForCap(
      plan.plan.slug,
      plan.plan.includedCredits,
      plan.plan.priceCents,
      plan.plan.spendingLimitCents,
    )
    const remainingCredits = Math.max(maxAllowed - consumedCredits, 0)
    return Math.floor(remainingCredits / ACTION_CREDITS.trace)
  }

  return null
}

/**
 * Whether the org can still bill a trace this period, which is all an import needs to make
 * progress: it meters trace by trace through the same gate live ingestion answers to.
 *
 * Asked at three points — before creating a job, before resuming a paused one, and before every
 * page — because usage moves under a long import. Live ingestion consumes it, a spending limit
 * can be lowered mid-run, and a period can roll over.
 */
export const importUsageAvailable = (plan: EffectivePlanResolution) =>
  Effect.gen(function* () {
    const budget = yield* importTraceBudget(plan)
    if (budget === null) return true
    return budget > 0
  })

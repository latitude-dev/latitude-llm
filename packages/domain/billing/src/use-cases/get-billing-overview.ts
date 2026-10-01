import { Effect } from "effect"
import { calculatePlanSpendMills, type PlanSlug } from "../constants.ts"
import { BillingUsagePeriodRepository } from "../ports/billing-usage-period-repository.ts"
import type { EffectivePlanResolution } from "./resolve-effective-plan.ts"

export interface BillingOverview {
  readonly planSlug: PlanSlug
  readonly planSource: EffectivePlanResolution["source"]
  readonly periodStart: Date
  readonly periodEnd: Date
  /** `null` when the plan entitlement is unbounded (Enterprise, self-hosted). */
  readonly includedCredits: number | null
  /** Authoritative period total, overage included. */
  readonly consumedCredits: number
  readonly overageCredits: number
  /** Portion of `consumedCredits` that counts against the included allowance. */
  readonly includedUsedCredits: number
  /** Credits left in the included allowance; `null` when unbounded. */
  readonly remainingCredits: number | null
  /** 0–1 fill of the included allowance; `1` when unbounded or at/over the allowance. */
  readonly usageProgress: number
  readonly isAtIncludedLimit: boolean
  readonly overageAmountMills: number
  readonly overageAllowed: boolean
  readonly hardCapped: boolean
  readonly retentionDays: number
  readonly currentSpendMills: number | null
  readonly spendingLimitCents: number | null
}

/** Current-period credit position for an already-resolved plan. */
export const getBillingOverviewUseCase = Effect.fn("billing.getOverview")(function* (orgPlan: EffectivePlanResolution) {
  const periodRepo = yield* BillingUsagePeriodRepository
  const period = yield* periodRepo.findOptionalByPeriod({
    organizationId: orgPlan.organizationId,
    periodStart: orgPlan.periodStart,
    periodEnd: orgPlan.periodEnd,
  })

  const includedCredits = Number.isFinite(orgPlan.plan.includedCredits) ? orgPlan.plan.includedCredits : null
  const consumedCredits = period?.consumedCredits ?? 0
  const overageCredits = period?.overageCredits ?? 0
  const overageAmountMills = period?.overageAmountMills ?? 0
  const includedUsedCredits = includedCredits === null ? consumedCredits : Math.min(consumedCredits, includedCredits)
  const remainingCredits = includedCredits === null ? null : Math.max(includedCredits - consumedCredits, 0)
  const isAtIncludedLimit = includedCredits !== null && includedCredits > 0 && consumedCredits >= includedCredits
  const usageProgress =
    includedCredits === null || includedCredits <= 0 ? 1 : Math.min(consumedCredits / includedCredits, 1)

  return {
    planSlug: orgPlan.plan.slug,
    planSource: orgPlan.source,
    periodStart: orgPlan.periodStart,
    periodEnd: orgPlan.periodEnd,
    includedCredits,
    consumedCredits,
    overageCredits,
    includedUsedCredits,
    remainingCredits,
    usageProgress,
    isAtIncludedLimit,
    overageAmountMills,
    overageAllowed: orgPlan.plan.overageAllowed,
    hardCapped: orgPlan.plan.hardCapped,
    retentionDays: orgPlan.plan.retentionDays,
    currentSpendMills: calculatePlanSpendMills(orgPlan.plan.slug, overageAmountMills),
    spendingLimitCents: orgPlan.plan.spendingLimitCents,
  } satisfies BillingOverview
})

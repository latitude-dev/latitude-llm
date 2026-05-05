import type { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import { ACTION_CREDITS, calculateOverageAmountMicrocents } from "../constants.ts"
import type { ChargeableAction } from "../constants.ts"
import type { BillingUsagePeriod } from "../entities/billing-usage-period.ts"
import { BillingUsagePeriodRepository } from "../ports/billing-usage-period-repository.ts"
import type { EffectivePlanResolution } from "./resolve-effective-plan.ts"
import { resolveEffectivePlan } from "./resolve-effective-plan.ts"

export interface AuthorizedBillableActionContext {
  readonly planSlug: "free" | "pro" | "enterprise"
  readonly planSource: "override" | "subscription" | "free-fallback"
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly includedCredits: number
  readonly overageAllowed: boolean
}

export interface AuthorizeBillableActionInput {
  readonly organizationId: OrganizationId
  readonly action: ChargeableAction
  readonly skipIfBlocked?: boolean | undefined
  readonly resolvedPlan?: EffectivePlanResolution | undefined
}

export interface AuthorizeBillableActionResult {
  readonly allowed: boolean
  readonly period: {
    start: Date
    end: Date
    includedCredits: number
    consumedCredits: number
    overageCredits: number
  } | null
  readonly context: AuthorizedBillableActionContext
}

const toAuthorizedPlanSource = (source: string): AuthorizedBillableActionContext["planSource"] =>
  source as AuthorizedBillableActionContext["planSource"]

const toMeteredPeriod = (period: BillingUsagePeriod | null): AuthorizeBillableActionResult["period"] => {
  if (!period) return null

  return {
    start: period.periodStart,
    end: period.periodEnd,
    includedCredits: period.includedCredits,
    consumedCredits: period.consumedCredits,
    overageCredits: period.overageCredits,
  }
}

export const authorizeBillableAction = Effect.fn("billing.authorizeBillableAction")(function* (
  input: AuthorizeBillableActionInput,
) {
  yield* Effect.annotateCurrentSpan("billing.action", input.action)

  const orgPlan = input.resolvedPlan ?? (yield* resolveEffectivePlan(input.organizationId))
  const periodRepo = yield* BillingUsagePeriodRepository
  const current = yield* periodRepo.findByPeriod({
    organizationId: input.organizationId,
    periodStart: orgPlan.periodStart,
    periodEnd: orgPlan.periodEnd,
  })

  const credits = ACTION_CREDITS[input.action]
  let allowed = true

  if (input.skipIfBlocked && orgPlan.plan.hardCapped) {
    const consumedCredits = current?.consumedCredits ?? 0
    if (consumedCredits + credits > orgPlan.plan.includedCredits) {
      allowed = false
    }
  }

  if (allowed && orgPlan.plan.spendingLimitCents !== null && orgPlan.plan.priceCents !== null) {
    const projectedConsumed = (current?.consumedCredits ?? 0) + credits
    const projectedOverage = Math.max(projectedConsumed - orgPlan.plan.includedCredits, 0)
    const projectedOverageAmountMicrocents = calculateOverageAmountMicrocents(orgPlan.plan.slug, projectedOverage)
    const projectedSpendMicrocents = orgPlan.plan.priceCents * 1_000_000 + projectedOverageAmountMicrocents

    if (projectedSpendMicrocents > orgPlan.plan.spendingLimitCents * 1_000_000) {
      allowed = false
    }
  }

  return {
    allowed,
    period: toMeteredPeriod(current),
    context: {
      planSlug: orgPlan.plan.slug,
      planSource: toAuthorizedPlanSource(orgPlan.source),
      periodStart: orgPlan.periodStart,
      periodEnd: orgPlan.periodEnd,
      includedCredits: orgPlan.plan.includedCredits,
      overageAllowed: orgPlan.plan.overageAllowed,
    },
  } satisfies AuthorizeBillableActionResult
})

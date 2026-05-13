import type { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { ChargeableAction, PlanSlug } from "../constants.ts"
import {
  ACTION_CREDITS,
  BILLING_SPEND_RESERVATION_TTL_SECONDS,
  CENT_TO_MILLS,
  calculateMaxAllowedConsumedCreditsForCap,
  calculateOverageAmountMills,
} from "../constants.ts"
import type { BillingUsagePeriod } from "../entities/billing-usage-period.ts"
import { BillingSpendReservation } from "../ports/billing-spend-reservation.ts"
import { BillingUsagePeriodRepository } from "../ports/billing-usage-period-repository.ts"
import type { EffectivePlanResolution } from "./resolve-effective-plan.ts"
import { resolveEffectivePlan } from "./resolve-effective-plan.ts"

export interface AuthorizedBillableActionContext {
  readonly planSlug: PlanSlug
  readonly planSource: EffectivePlanResolution["source"]
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly includedCredits: number
  readonly overageAllowed: boolean
}

export interface AuthorizeBillableActionInput {
  readonly organizationId: OrganizationId
  readonly action: ChargeableAction
  readonly skipIfBlocked?: boolean | undefined
  /**
   * Identifier of the logical action being authorized. When the resolved plan has a
   * spending limit set, this is required so the spend-reservation port can enforce
   * the cap atomically and dedupe authorize retries for the same logical action.
   * Callers should reuse the same key they will later use when recording usage.
   */
  readonly idempotencyKey: string
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

const toAuthorizationContext = (plan: EffectivePlanResolution): AuthorizedBillableActionContext => ({
  planSlug: plan.plan.slug,
  planSource: plan.source,
  periodStart: plan.periodStart,
  periodEnd: plan.periodEnd,
  includedCredits: plan.plan.includedCredits,
  overageAllowed: plan.plan.overageAllowed,
})

const denyAuthorization = (
  current: BillingUsagePeriod | null,
  context: AuthorizedBillableActionContext,
): AuthorizeBillableActionResult => ({
  allowed: false,
  period: toMeteredPeriod(current),
  context,
})

export const authorizeBillableAction = Effect.fn("billing.authorizeBillableAction")(function* (
  input: AuthorizeBillableActionInput,
) {
  yield* Effect.annotateCurrentSpan("billing.action", input.action)

  const orgPlan = yield* resolveEffectivePlan(input.organizationId)
  const context = toAuthorizationContext(orgPlan)
  const creditsRequested = ACTION_CREDITS[input.action]
  const periodRepo = yield* BillingUsagePeriodRepository
  const current = yield* periodRepo.findOptionalByPeriod({
    organizationId: input.organizationId,
    periodStart: orgPlan.periodStart,
    periodEnd: orgPlan.periodEnd,
  })

  const enforceHardCap = input.skipIfBlocked === true && orgPlan.plan.hardCapped
  const enforceSpendingLimit = orgPlan.plan.spendingLimitCents !== null && orgPlan.plan.priceCents !== null

  if (enforceHardCap || enforceSpendingLimit) {
    const projectedConsumedCredits = (current?.consumedCredits ?? 0) + creditsRequested
    let maxAllowedConsumedCredits = orgPlan.plan.includedCredits

    if (enforceSpendingLimit) {
      const projectedOverageCredits = Math.max(projectedConsumedCredits - orgPlan.plan.includedCredits, 0)
      const projectedOverageAmountMills = calculateOverageAmountMills(orgPlan.plan.slug, projectedOverageCredits)
      const projectedSpendMills = orgPlan.plan.priceCents * CENT_TO_MILLS + projectedOverageAmountMills

      if (projectedSpendMills > orgPlan.plan.spendingLimitCents * CENT_TO_MILLS) {
        return denyAuthorization(current, context)
      }

      maxAllowedConsumedCredits = calculateMaxAllowedConsumedCreditsForCap(
        orgPlan.plan.slug,
        orgPlan.plan.includedCredits,
        orgPlan.plan.priceCents,
        orgPlan.plan.spendingLimitCents,
      )
    }

    // The Postgres snapshot above is racy under concurrent fan-out: N workers near a
    // hard cap or spending limit can each project under the threshold against the same
    // pre-increment snapshot, then all advance the period and overshoot. The
    // reservation port serializes those decisions through an atomic counter.
    const reservation = yield* BillingSpendReservation
    const reserved = yield* reservation.tryReserve({
      organizationId: input.organizationId,
      periodStart: orgPlan.periodStart,
      periodEnd: orgPlan.periodEnd,
      idempotencyKey: input.idempotencyKey,
      creditsRequested: creditsRequested,
      maxAllowedConsumedCredits,
      fallbackConsumedCredits: current?.consumedCredits ?? 0,
      ttlSeconds: BILLING_SPEND_RESERVATION_TTL_SECONDS,
    })

    if (!reserved) {
      yield* Effect.annotateCurrentSpan("billing.spend_reservation_refused", true)
      return denyAuthorization(current, context)
    }
  }

  return {
    allowed: true,
    period: toMeteredPeriod(current),
    context,
  } satisfies AuthorizeBillableActionResult
})

import {
  BillingOverrideRepository,
  BillingUsagePeriodRepository,
  calculatePlanSpendMicrocents,
  type EffectivePlanResolution,
  type PlanSlug,
  StripeSubscriptionLookup,
} from "@domain/billing"
import type { OrganizationId } from "@domain/shared"
import { Effect } from "effect"

export interface AdminOrganizationBilling {
  readonly effectivePlanSlug: PlanSlug
  readonly effectivePlanSource: EffectivePlanResolution["source"]
  readonly stripeSubscriptionPlan: string | null
  readonly stripeSubscriptionStatus: string | null
  readonly periodStart: Date
  readonly periodEnd: Date
  /** `null` when entitlement is effectively unlimited (Enterprise). */
  readonly includedCredits: number | null
  readonly consumedCredits: number
  readonly overageCredits: number
  readonly overageAmountMicrocents: number
  readonly retentionDays: number
  readonly currentSpendMicrocents: number | null
  readonly spendingLimitCents: number | null
  readonly override: {
    readonly plan: PlanSlug
    readonly includedCredits: number | null
    readonly retentionDays: number | null
    readonly notes: string | null
    readonly updatedAt: Date
  } | null
}

export interface GetOrganizationBillingInput {
  readonly organizationId: OrganizationId
  readonly resolvedPlan: EffectivePlanResolution
}

export const getOrganizationBillingUseCase = Effect.fn("admin.getOrganizationBilling")(function* (
  input: GetOrganizationBillingInput,
) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)

  const overrideRepo = yield* BillingOverrideRepository
  const periodRepo = yield* BillingUsagePeriodRepository
  const stripeLookup = yield* StripeSubscriptionLookup

  const [override, period, subscription] = yield* Effect.all([
    overrideRepo.findByOrganizationId(input.organizationId),
    periodRepo.findByPeriod({
      organizationId: input.organizationId,
      periodStart: input.resolvedPlan.periodStart,
      periodEnd: input.resolvedPlan.periodEnd,
    }),
    stripeLookup.findActiveByOrganizationId(input.organizationId),
  ])

  return {
    effectivePlanSlug: input.resolvedPlan.plan.slug,
    effectivePlanSource: input.resolvedPlan.source,
    stripeSubscriptionPlan: subscription?.plan ?? null,
    stripeSubscriptionStatus: subscription?.status ?? null,
    periodStart: input.resolvedPlan.periodStart,
    periodEnd: input.resolvedPlan.periodEnd,
    includedCredits: Number.isFinite(input.resolvedPlan.plan.includedCredits)
      ? input.resolvedPlan.plan.includedCredits
      : null,
    consumedCredits: period?.consumedCredits ?? 0,
    overageCredits: period?.overageCredits ?? 0,
    overageAmountMicrocents: period?.overageAmountMicrocents ?? 0,
    retentionDays: input.resolvedPlan.plan.retentionDays,
    currentSpendMicrocents: calculatePlanSpendMicrocents(
      input.resolvedPlan.plan.slug,
      period?.overageAmountMicrocents ?? 0,
    ),
    spendingLimitCents: input.resolvedPlan.plan.spendingLimitCents,
    override: override
      ? {
          plan: override.plan,
          includedCredits: override.includedCredits,
          retentionDays: override.retentionDays,
          notes: override.notes,
          updatedAt: override.updatedAt,
        }
      : null,
  } satisfies AdminOrganizationBilling
})

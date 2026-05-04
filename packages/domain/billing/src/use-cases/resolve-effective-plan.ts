import { type OrganizationId, SettingsReader } from "@domain/shared"
import { Effect } from "effect"
import { PLAN_CONFIGS, type PlanSlug, SELF_SERVE_PLAN_SLUG_TO_STRIPE_PLAN_NAME } from "../constants.ts"
import type { BillingOverride } from "../entities/billing-override.ts"
import { UnknownStripePlanError } from "../errors.ts"
import { BillingOverrideRepository } from "../ports/billing-override-repository.ts"
import type { StripeSubscriptionRow } from "../ports/stripe-subscription-lookup.ts"
import { StripeSubscriptionLookup } from "../ports/stripe-subscription-lookup.ts"

const buildCurrentUtcMonthPeriod = () => {
  const now = new Date()

  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  }
}

const buildResolvedPlan = (input: {
  readonly slug: PlanSlug
  readonly includedCredits: number
  readonly retentionDays: number
  readonly overageAllowed: boolean
  readonly hardCapped: boolean
  readonly priceCents: number | null
  readonly spendingLimitCents: number | null
}): EffectivePlanResolution["plan"] => ({
  slug: input.slug,
  includedCredits: input.includedCredits,
  retentionDays: input.retentionDays,
  overageAllowed: input.overageAllowed,
  hardCapped: input.hardCapped,
  priceCents: input.priceCents,
  spendingLimitCents: input.slug === "pro" ? input.spendingLimitCents : null,
})

const resolveOverridePlan = (input: {
  readonly organizationId: OrganizationId
  readonly override: BillingOverride
  readonly spendingLimitCents: number | null
}): EffectivePlanResolution => {
  const plan = PLAN_CONFIGS[input.override.plan]
  const currentMonth = buildCurrentUtcMonthPeriod()

  return {
    organizationId: input.organizationId,
    plan: buildResolvedPlan({
      slug: plan.slug,
      includedCredits: input.override.includedCredits ?? plan.includedCredits,
      retentionDays: input.override.retentionDays ?? plan.retentionDays,
      overageAllowed: plan.overageAllowed,
      hardCapped: plan.hardCapped,
      priceCents: plan.priceCents,
      spendingLimitCents: input.spendingLimitCents,
    }),
    source: "override",
    periodStart: currentMonth.start,
    periodEnd: currentMonth.end,
  }
}

const resolveSubscriptionPlan = Effect.fn("billing.resolveSubscriptionPlan")(function* (input: {
  readonly organizationId: OrganizationId
  readonly subscription: StripeSubscriptionRow | null
  readonly spendingLimitCents: number | null
}) {
  const subscription = input.subscription
  if (!subscription || !["active", "trialing"].includes(subscription.status ?? "")) {
    return null
  }

  const mappedSlug: PlanSlug | undefined = SELF_SERVE_PLAN_SLUG_TO_STRIPE_PLAN_NAME[subscription.plan]
  if (!mappedSlug) {
    yield* Effect.annotateCurrentSpan({
      "billing.alert": "unknown_stripe_plan",
      "billing.stripe_plan_name": subscription.plan,
      "billing.subscription_status": subscription.status ?? "unknown",
    })
    return yield* new UnknownStripePlanError({ planName: subscription.plan })
  }

  const plan = PLAN_CONFIGS[mappedSlug]

  if (subscription.periodStart === null || subscription.periodEnd === null) {
    yield* Effect.annotateCurrentSpan({
      "billing.alert": "subscription_missing_period",
      "billing.subscription_status": subscription.status ?? "unknown",
      "billing.stripe_plan_name": subscription.plan,
    })
  }

  return {
    organizationId: input.organizationId,
    plan: buildResolvedPlan({
      slug: plan.slug,
      includedCredits: plan.includedCredits,
      retentionDays: plan.retentionDays,
      overageAllowed: plan.overageAllowed,
      hardCapped: plan.hardCapped,
      priceCents: plan.priceCents,
      spendingLimitCents: input.spendingLimitCents,
    }),
    source: "subscription",
    periodStart: subscription.periodStart ?? new Date(),
    periodEnd: subscription.periodEnd ?? new Date(),
  } satisfies EffectivePlanResolution
})

const resolveFreeFallbackPlan = (input: {
  readonly organizationId: OrganizationId
  readonly spendingLimitCents: number | null
}): EffectivePlanResolution => {
  const freePlan = PLAN_CONFIGS.free
  const currentMonth = buildCurrentUtcMonthPeriod()

  return {
    organizationId: input.organizationId,
    plan: buildResolvedPlan({
      slug: freePlan.slug,
      includedCredits: freePlan.includedCredits,
      retentionDays: freePlan.retentionDays,
      overageAllowed: freePlan.overageAllowed,
      hardCapped: freePlan.hardCapped,
      priceCents: freePlan.priceCents,
      spendingLimitCents: input.spendingLimitCents,
    }),
    source: "free-fallback",
    periodStart: currentMonth.start,
    periodEnd: currentMonth.end,
  }
}

export interface EffectivePlanResolution {
  readonly organizationId: OrganizationId
  readonly plan: {
    readonly slug: PlanSlug
    readonly includedCredits: number
    readonly retentionDays: number
    readonly overageAllowed: boolean
    readonly hardCapped: boolean
    readonly priceCents: number | null
    readonly spendingLimitCents: number | null
  }
  readonly source: "override" | "subscription" | "free-fallback"
  readonly periodStart: Date
  readonly periodEnd: Date
}

export const resolveEffectivePlan = Effect.fn("billing.resolveEffectivePlan")(function* (
  organizationId: OrganizationId,
) {
  yield* Effect.annotateCurrentSpan("organizationId", organizationId)

  const overrideRepo = yield* BillingOverrideRepository
  const settingsReader = yield* SettingsReader
  const override = yield* overrideRepo.findOptionalByOrganizationId(organizationId)
  const settings = (yield* settingsReader.getOrganizationSettings()) ?? {}
  const spendingLimitCents = settings.billing?.spendingLimitCents ?? null

  if (override) {
    return resolveOverridePlan({ organizationId, override, spendingLimitCents })
  }

  const subLookup = yield* StripeSubscriptionLookup
  const subscription = yield* subLookup.findOptionalActiveByOrganizationId(organizationId)

  const resolvedSubscriptionPlan = yield* resolveSubscriptionPlan({
    organizationId,
    subscription,
    spendingLimitCents,
  })
  if (resolvedSubscriptionPlan) {
    return resolvedSubscriptionPlan
  }

  return resolveFreeFallbackPlan({ organizationId, spendingLimitCents })
})

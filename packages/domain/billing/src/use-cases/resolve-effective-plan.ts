import { type OrganizationId, SettingsReader } from "@domain/shared"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { PLAN_CONFIGS, type PlanSlug, SELF_SERVE_PLAN_SLUG_TO_STRIPE_PLAN_NAME } from "../constants.ts"
import { UnknownStripePlanError } from "../errors.ts"
import { BillingOverrideRepository } from "../ports/billing-override-repository.ts"
import { StripeSubscriptionLookup } from "../ports/stripe-subscription-lookup.ts"

const log = createLogger("billing")

export const resolveEffectivePlan = Effect.fn("billing.resolveEffectivePlan")(function* (
  organizationId: OrganizationId,
) {
  yield* Effect.annotateCurrentSpan("organizationId", organizationId)

  const overrideRepo = yield* BillingOverrideRepository
  const settingsReader = yield* SettingsReader
  const override = yield* overrideRepo.findByOrganizationId(organizationId)
  const settings = (yield* settingsReader.getOrganizationSettings()) ?? {}
  const spendingLimitCents = settings.billing?.spendingLimitCents ?? null

  if (override) {
    const plan = PLAN_CONFIGS[override.plan]
    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

    return {
      organizationId,
      plan: {
        slug: plan.slug,
        includedCredits: override.includedCredits ?? plan.includedCredits,
        retentionDays: override.retentionDays ?? plan.retentionDays,
        overageAllowed: plan.overageAllowed,
        hardCapped: plan.hardCapped,
        priceCents: plan.priceCents,
        spendingLimitCents: plan.slug === "pro" ? spendingLimitCents : null,
      },
      source: "override",
      periodStart: monthStart,
      periodEnd: monthEnd,
    }
  }

  const subLookup = yield* StripeSubscriptionLookup
  const subscription = yield* subLookup.findActiveByOrganizationId(organizationId)

  if (subscription && ["active", "trialing"].includes(subscription.status ?? "")) {
    const planName = subscription.plan
    const mappedSlug: PlanSlug | undefined = SELF_SERVE_PLAN_SLUG_TO_STRIPE_PLAN_NAME[planName]

    if (!mappedSlug) {
      log.error(`Unknown Stripe plan name`, { planName, organizationId })
      return yield* new UnknownStripePlanError({ planName })
    }

    const plan = PLAN_CONFIGS[mappedSlug]

    return {
      organizationId,
      plan: {
        slug: plan.slug,
        includedCredits: plan.includedCredits,
        retentionDays: plan.retentionDays,
        overageAllowed: plan.overageAllowed,
        hardCapped: plan.hardCapped,
        priceCents: plan.priceCents,
        spendingLimitCents: plan.slug === "pro" ? spendingLimitCents : null,
      },
      source: "subscription",
      periodStart: subscription.periodStart ?? new Date(),
      periodEnd: subscription.periodEnd ?? new Date(),
    }
  }

  const freePlan = PLAN_CONFIGS.free
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

  return {
    organizationId,
    plan: {
      slug: freePlan.slug,
      includedCredits: freePlan.includedCredits,
      retentionDays: freePlan.retentionDays,
      overageAllowed: freePlan.overageAllowed,
      hardCapped: freePlan.hardCapped,
      priceCents: freePlan.priceCents,
      spendingLimitCents: null,
    },
    source: "free-fallback",
    periodStart: monthStart,
    periodEnd: monthEnd,
  }
})

import type { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import { NoCreditsRemainingError } from "../errors.ts"
import { checkCreditAvailabilityUseCase } from "./check-credit-availability.ts"
import { resolveEffectivePlan } from "./resolve-effective-plan.ts"

export const checkTraceIngestionBillingUseCase = Effect.fn("billing.checkTraceIngestion")(function* (
  organizationId: OrganizationId,
) {
  yield* Effect.annotateCurrentSpan("billing.organizationId", organizationId)

  const plan = yield* resolveEffectivePlan(organizationId)
  const allowed = yield* checkCreditAvailabilityUseCase({
    organizationId,
    action: "trace",
    planSlug: plan.plan.slug,
    periodStart: plan.periodStart,
    periodEnd: plan.periodEnd,
    includedCredits: plan.plan.includedCredits,
    hardCapped: plan.plan.hardCapped,
    priceCents: plan.plan.priceCents,
    spendingLimitCents: plan.plan.spendingLimitCents,
  })

  if (!allowed) {
    return yield* Effect.fail(
      new NoCreditsRemainingError({
        organizationId,
        planSlug: plan.plan.slug,
        action: "trace",
      }),
    )
  }
})

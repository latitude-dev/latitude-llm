import { checkCreditAvailabilityUseCase, type EffectivePlanResolution } from "@domain/billing"

/**
 * Whether the org can still bill a trace this period, which is all an import needs to make
 * progress: it meters trace by trace through the same gate live ingestion answers to.
 *
 * Asked at three points — before creating a job, before resuming a paused one, and before every
 * page — because usage moves under a long import. Live ingestion consumes it, a spending limit
 * can be lowered mid-run, and a period can roll over.
 */
export const importUsageAvailable = (plan: EffectivePlanResolution) =>
  checkCreditAvailabilityUseCase({
    organizationId: plan.organizationId,
    action: "trace",
    planSlug: plan.plan.slug,
    periodStart: plan.periodStart,
    periodEnd: plan.periodEnd,
    includedCredits: plan.plan.includedCredits,
    hardCapped: plan.plan.hardCapped,
    priceCents: plan.plan.priceCents,
    spendingLimitCents: plan.plan.spendingLimitCents,
  })

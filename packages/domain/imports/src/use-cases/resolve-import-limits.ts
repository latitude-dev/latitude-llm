import type { EffectivePlanResolution } from "@domain/billing"
import { type ImportLimits, resolveImportLimits } from "../entities/import-limits.ts"

/**
 * The org's current import ceiling, read from its effective plan. Both the wizard and job
 * creation go through here, so what a user is shown is what the backend will accept.
 */
export const importLimitsForPlan = (plan: EffectivePlanResolution): ImportLimits =>
  resolveImportLimits({
    planSlug: plan.plan.slug,
    retentionDays: plan.plan.retentionDays,
    periodEnd: plan.periodEnd,
  })

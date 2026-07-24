import { calculateMaxAllowedConsumedCreditsForCap, PLAN_CONFIGS, type PlanSlug } from "../constants.ts"

export const BILLING_LIMIT_KINDS = ["included-credits", "overage-started", "spend-cap"] as const
export type BillingLimitKind = (typeof BILLING_LIMIT_KINDS)[number]

/**
 * Detects the first crossing of a billing threshold within a usage write.
 * Returns null when the period was already at/over the threshold before this
 * increment (so downstream notification fan-out stays once-per-period).
 */
export const detectBillingLimitCrossed = (input: {
  readonly previousConsumedCredits: number
  readonly consumedCredits: number
  readonly includedCredits: number
  readonly overageAllowed: boolean
  readonly planSlug: PlanSlug
  readonly spendingLimitCents: number | null
}): BillingLimitKind | null => {
  if (!input.overageAllowed) {
    if (input.previousConsumedCredits < input.includedCredits && input.consumedCredits >= input.includedCredits) {
      return "included-credits"
    }
    return null
  }

  const priceCents = PLAN_CONFIGS[input.planSlug].priceCents
  if (input.spendingLimitCents === null || priceCents === null) {
    if (input.previousConsumedCredits < input.includedCredits && input.consumedCredits >= input.includedCredits) {
      return "overage-started"
    }
    return null
  }

  const maxAllowed = calculateMaxAllowedConsumedCreditsForCap(
    input.planSlug,
    input.includedCredits,
    priceCents,
    input.spendingLimitCents,
  )

  if (input.previousConsumedCredits < maxAllowed && input.consumedCredits >= maxAllowed) {
    return "spend-cap"
  }

  return null
}

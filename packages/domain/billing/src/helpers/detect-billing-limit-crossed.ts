import { calculateMaxAllowedConsumedCreditsForCap, PLAN_CONFIGS, type PlanSlug } from "../constants.ts"

export const BILLING_LIMIT_KINDS = ["included-credits", "overage-started", "spend-cap"] as const
export type BillingLimitKind = (typeof BILLING_LIMIT_KINDS)[number]

/**
 * Detects billing thresholds first crossed within a usage write. Returns an
 * empty array when nothing new was crossed (so notification fan-out stays
 * once-per-period per kind). A single write may cross both overage entry and
 * a spend cap when the cap sits at the included-credit boundary.
 */
export const detectBillingLimitCrossed = (input: {
  readonly previousConsumedCredits: number
  readonly consumedCredits: number
  readonly includedCredits: number
  readonly overageAllowed: boolean
  readonly planSlug: PlanSlug
  readonly spendingLimitCents: number | null
}): BillingLimitKind[] => {
  const crossed: BillingLimitKind[] = []

  if (!input.overageAllowed) {
    if (input.previousConsumedCredits < input.includedCredits && input.consumedCredits >= input.includedCredits) {
      crossed.push("included-credits")
    }
    return crossed
  }

  if (input.previousConsumedCredits < input.includedCredits && input.consumedCredits >= input.includedCredits) {
    crossed.push("overage-started")
  }

  const priceCents = PLAN_CONFIGS[input.planSlug].priceCents
  if (input.spendingLimitCents === null || priceCents === null) {
    return crossed
  }

  const maxAllowed = calculateMaxAllowedConsumedCreditsForCap(
    input.planSlug,
    input.includedCredits,
    priceCents,
    input.spendingLimitCents,
  )

  if (input.previousConsumedCredits < maxAllowed && input.consumedCredits >= maxAllowed) {
    crossed.push("spend-cap")
  }

  return crossed
}

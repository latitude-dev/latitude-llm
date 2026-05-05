export const PLAN_SLUGS = ["free", "pro", "enterprise"] as const

export type PlanSlug = (typeof PLAN_SLUGS)[number]

export const CENT_TO_MICROCENTS = 1_000_000

export const SELF_SERVE_PLAN_SLUGS: readonly PlanSlug[] = ["pro"] as const

export const CHARGEABLE_ACTIONS = ["trace", "flagger-scan", "live-eval-scan", "eval-generation"] as const

export type ChargeableAction = (typeof CHARGEABLE_ACTIONS)[number]

export const ACTION_CREDITS: Record<ChargeableAction, number> = {
  trace: 1,
  "flagger-scan": 30,
  "live-eval-scan": 30,
  "eval-generation": 1000,
} as const

export const FREE_PLAN_CONFIG = {
  slug: "free" as const,
  selfServe: false,
  includedCredits: 20_000,
  retentionDays: 30,
  overageAllowed: false,
  hardCapped: true,
  priceCents: 0,
} as const

export const PRO_PLAN_CONFIG = {
  slug: "pro" as const,
  selfServe: true,
  includedCredits: 100_000,
  retentionDays: 90,
  overageAllowed: true,
  hardCapped: false,
  priceCents: 9900,
  overageCreditsPerUnit: 10_000,
  overagePriceCentsPerUnit: 2000,
} as const

/** Upper bound for `billing_usage_periods.included_credits` (Postgres `integer`). */
export const BILLING_INCLUDED_CREDITS_PG_MAX = 2_147_483_647

export const ENTERPRISE_PLAN_CONFIG = {
  slug: "enterprise" as const,
  selfServe: false,
  includedCredits: Infinity,
  retentionDays: 365,
  overageAllowed: true,
  hardCapped: false,
  priceCents: null as null,
} as const

export type PlanConfig = {
  slug: PlanSlug
  selfServe: boolean
  includedCredits: number
  retentionDays: number
  overageAllowed: boolean
  hardCapped: boolean
  priceCents: number | null
}

export const PLAN_CONFIGS: Record<PlanSlug, PlanConfig> = {
  free: FREE_PLAN_CONFIG,
  pro: PRO_PLAN_CONFIG,
  enterprise: ENTERPRISE_PLAN_CONFIG,
} as const

export const SELF_SERVE_PLAN_SLUG_TO_STRIPE_PLAN_NAME: Record<string, PlanSlug> = {
  pro: "pro",
} as const

export const OverageCreditUnit = PRO_PLAN_CONFIG.overageCreditsPerUnit

export const calculateOverageAmountMicrocents = (planSlug: PlanSlug, overageCredits: number) => {
  if (planSlug !== "pro") return 0

  return Math.floor(
    (overageCredits * PRO_PLAN_CONFIG.overagePriceCentsPerUnit * CENT_TO_MICROCENTS) /
      PRO_PLAN_CONFIG.overageCreditsPerUnit,
  )
}

/**
 * Maps logical plan allowances (including enterprise `Infinity`) to values safe to persist in PG `integer`.
 */
export const persistedIncludedCreditsForPlan = (planSlug: PlanSlug, logicalIncludedCredits: number): number => {
  if (planSlug === "enterprise" || !Number.isFinite(logicalIncludedCredits)) {
    return BILLING_INCLUDED_CREDITS_PG_MAX
  }
  if (logicalIncludedCredits > BILLING_INCLUDED_CREDITS_PG_MAX) {
    return BILLING_INCLUDED_CREDITS_PG_MAX
  }
  return Math.trunc(logicalIncludedCredits)
}

export const buildBillingIdempotencyKey = (action: ChargeableAction, parts: readonly string[]): string => {
  for (const part of parts) {
    if (typeof part !== "string" || part.length === 0 || part.includes(":")) {
      throw new Error(
        `Invalid billing idempotency key part for action "${action}": parts must be non-empty and must not contain ":"`,
      )
    }
  }
  return [action, ...parts].join(":")
}

export const calculatePlanSpendMicrocents = (planSlug: PlanSlug, overageAmountMicrocents: number) => {
  const priceCents = PLAN_CONFIGS[planSlug].priceCents
  if (priceCents === null) return null

  return priceCents * CENT_TO_MICROCENTS + overageAmountMicrocents
}

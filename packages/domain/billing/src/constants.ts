import { InvalidBillingIdempotencyKeyError } from "./errors.ts"

export const PLAN_SLUGS = ["free", "pro", "enterprise"] as const

export type PlanSlug = (typeof PLAN_SLUGS)[number]

export const CENT_TO_MILLS = 10

export const BILLING_OVERAGE_SYNC_THROTTLE_MS = 5 * 60_000 // 5 minutes

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

export const calculateOverageAmountMills = (planSlug: PlanSlug, overageCredits: number) => {
  if (planSlug !== "pro") return 0

  return Math.floor(
    (overageCredits * PRO_PLAN_CONFIG.overagePriceCentsPerUnit * CENT_TO_MILLS) / PRO_PLAN_CONFIG.overageCreditsPerUnit,
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

export const buildBillingOverageDedupeKey = (input: {
  organizationId: string
  periodStart: Date
  periodEnd: Date
}): string =>
  `billing:reportOverage:${input.organizationId}:${input.periodStart.toISOString()}:${input.periodEnd.toISOString()}`

export const buildBillingIdempotencyKey = (action: ChargeableAction, parts: readonly string[]): string => {
  for (const part of parts) {
    if (typeof part !== "string" || part.length === 0 || part.includes(":")) {
      throw new InvalidBillingIdempotencyKeyError({
        action,
        reason: `parts must be non-empty strings and must not contain ":" (got ${JSON.stringify(part)})`,
      })
    }
  }
  return [action, ...parts].join(":")
}

export const calculatePlanSpendMills = (planSlug: PlanSlug, overageAmountMills: number) => {
  const priceCents = PLAN_CONFIGS[planSlug].priceCents
  if (priceCents === null) return null

  return priceCents * CENT_TO_MILLS + overageAmountMills
}

/**
 * Highest `consumedCredits` value whose projected period spend still fits inside
 * `spendingLimitCents`. Inverse of `calculateOverageAmountMills`. Used by
 * `authorizeBillableAction` to convert the cap into a single integer threshold the
 * spend-reservation port can enforce atomically without re-deriving pricing.
 */
export const calculateMaxAllowedConsumedCreditsForCap = (
  planSlug: PlanSlug,
  includedCredits: number,
  priceCents: number,
  spendingLimitCents: number,
): number => {
  const baseSpendMills = priceCents * CENT_TO_MILLS
  const capMills = spendingLimitCents * CENT_TO_MILLS
  if (baseSpendMills > capMills) return 0

  if (planSlug !== "pro") return Number.MAX_SAFE_INTEGER

  const maxOverageMills = capMills - baseSpendMills
  const maxOverageCredits = Math.floor(
    (maxOverageMills * PRO_PLAN_CONFIG.overageCreditsPerUnit) /
      (PRO_PLAN_CONFIG.overagePriceCentsPerUnit * CENT_TO_MILLS),
  )
  return includedCredits + maxOverageCredits
}

export const calculateMaxReportableOverageCreditsForCap = (
  planSlug: PlanSlug,
  includedCredits: number,
  priceCents: number,
  spendingLimitCents: number,
): number =>
  Math.max(
    calculateMaxAllowedConsumedCreditsForCap(planSlug, includedCredits, priceCents, spendingLimitCents) -
      includedCredits,
    0,
  )

/** TTL for in-memory spend-reservation counters. Comfortably outlasts any single billing period. */
export const BILLING_SPEND_RESERVATION_TTL_SECONDS = 60 * 60 * 24 * 34

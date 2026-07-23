import { InvalidBillingIdempotencyKeyError } from "./errors.ts"

export const PLAN_SLUGS = ["free", "pro", "enterprise"] as const

export type PlanSlug = (typeof PLAN_SLUGS)[number]

export const CENT_TO_MILLS = 10

export const BILLING_OVERAGE_SYNC_THROTTLE_MS = 5 * 60_000 // 5 minutes

export const SELF_SERVE_PLAN_SLUGS: readonly PlanSlug[] = ["pro"] as const

export const CHARGEABLE_ACTIONS = ["trace", "deterministic-eval-scan", "semantic-query", "llm-call"] as const

export type ChargeableAction = (typeof CHARGEABLE_ACTIONS)[number]

/**
 * Flat credit prices at the Pro overage rate ($0.002/credit). `llm-call` is the
 * authorization estimate and the fallback when the model registry has no pricing —
 * actual generations bill their estimated provider cost through
 * `creditsForLlmGenerationCost`. Derivation lives in dev-docs/billing.md.
 */
export const ACTION_CREDITS: Record<ChargeableAction, number> = {
  trace: 1,
  "deterministic-eval-scan": 1,
  "semantic-query": 15,
  "llm-call": 30,
} as const

export const FREE_PLAN_CONFIG = {
  slug: "free" as const,
  selfServe: false,
  includedCredits: 20_000,
  retentionDays: 30,
  overageAllowed: false,
  hardCapped: true,
  priceCents: 0,
  // Per-period sandbox span ceiling (Test Mode abuse guard, not billed). Read
  // through `resolveEffectivePlan`; enforced as a loud ingest refusal.
  spanQuotaPerPeriod: 100_000,
  sandboxActiveCap: 1,
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
  spanQuotaPerPeriod: 1_000_000,
  sandboxActiveCap: 1,
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
  spanQuotaPerPeriod: Number.POSITIVE_INFINITY,
  sandboxActiveCap: 1,
} as const

export type PlanConfig = {
  slug: PlanSlug
  selfServe: boolean
  includedCredits: number
  retentionDays: number
  overageAllowed: boolean
  hardCapped: boolean
  priceCents: number | null
  spanQuotaPerPeriod: number
  /** Max number of *active* sandboxes an org on this plan may have. */
  sandboxActiveCap: number
}

export const PLAN_CONFIGS: Record<PlanSlug, PlanConfig> = {
  free: FREE_PLAN_CONFIG,
  pro: PRO_PLAN_CONFIG,
  enterprise: ENTERPRISE_PLAN_CONFIG,
} as const

export const SANDBOX_SPAN_RETENTION_DAYS = 7

export const SELF_SERVE_PLAN_SLUG_TO_STRIPE_PLAN_NAME: Record<string, PlanSlug> = {
  pro: "pro",
} as const

export const OverageCreditUnit = PRO_PLAN_CONFIG.overageCreditsPerUnit

/** Dollar value of one credit at the Pro overage rate, in mills ($20 per 10k credits = 2 mills). */
export const CREDIT_VALUE_MILLS =
  (PRO_PLAN_CONFIG.overagePriceCentsPerUnit * CENT_TO_MILLS) / PRO_PLAN_CONFIG.overageCreditsPerUnit

export const LLM_GENERATION_BILLING_MARGIN = 1.3

export const SEMANTIC_QUERY_BILLING_MARGIN = 2

/**
 * voyage-4-large embed rate. Voyage models are absent from the `@domain/models`
 * registry, so query-embed cost is priced with this constant against the
 * adapter-reported token count.
 */
export const SEMANTIC_QUERY_EMBED_USD_PER_MILLION_TOKENS = 0.12

const USD_TO_MILLS = 1_000

const creditsForCostWithMargin = (costUsd: number, margin: number): number =>
  Math.max(1, Math.ceil((costUsd * USD_TO_MILLS * margin) / CREDIT_VALUE_MILLS))

/**
 * Credits billed for one LLM generation from its estimated provider cost: a 1.3x
 * margin over cost, converted at the overage credit value, rounded up to an integer
 * with a 1-credit floor.
 */
export const creditsForLlmGenerationCost = (costUsd: number): number =>
  creditsForCostWithMargin(costUsd, LLM_GENERATION_BILLING_MARGIN)

/**
 * Credits billed for one semantic query from its estimated embed cost: same
 * conversion as LLM generations but at a 2x margin.
 */
export const creditsForSemanticQueryCost = (costUsd: number): number =>
  creditsForCostWithMargin(costUsd, SEMANTIC_QUERY_BILLING_MARGIN)

/** Estimated provider cost of one query embed from the adapter-reported token count. */
export const semanticQueryEmbedCostUsd = (tokens: number): number =>
  (tokens * SEMANTIC_QUERY_EMBED_USD_PER_MILLION_TOKENS) / 1_000_000

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

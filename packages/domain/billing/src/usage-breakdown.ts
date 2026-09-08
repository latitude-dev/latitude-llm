import type { ProjectId } from "@domain/shared"
import type { ChargeableAction } from "./constants.ts"

/**
 * First key part of every AI metering scope, and therefore the third segment of
 * each `llm-call` / `semantic-query` idempotency key. Adding a label here forces a
 * `BILLING_METERING_LABEL_CATEGORIES` entry, so usage never lands in "other" by
 * accident.
 */
export const BILLING_METERING_LABELS = [
  "annotation-enrich",
  "eval-align-baseline",
  "eval-align-incremental",
  "eval-optimize",
  "flagger",
  "flagger-classify",
  "live-eval",
  "session-analysis",
  "signal-assign",
  "signal-create",
  "signal-promotion",
  "signal-refresh",
  "taxonomy-facet-extract",
  "taxonomy-name",
] as const

export type BillingMeteringLabel = (typeof BILLING_METERING_LABELS)[number]

export type BillingMeteringKeyParts = readonly [BillingMeteringLabel, ...string[]]

export const BILLING_USAGE_CATEGORIES = [
  "traces",
  "moments",
  "flaggers",
  "signals",
  "behaviors",
  "evaluations",
  "annotations",
  "other",
] as const

export type BillingUsageCategory = (typeof BILLING_USAGE_CATEGORIES)[number]

export const BILLING_USAGE_CATEGORY_LABELS: Record<BillingUsageCategory, string> = {
  traces: "Traces",
  moments: "Moments",
  flaggers: "Flaggers",
  signals: "Signals",
  behaviors: "Behaviors",
  evaluations: "Evaluations",
  annotations: "Annotations",
  other: "Other",
}

export const BILLING_METERING_LABEL_CATEGORIES: Record<BillingMeteringLabel, BillingUsageCategory> = {
  "annotation-enrich": "annotations",
  "eval-align-baseline": "evaluations",
  "eval-align-incremental": "evaluations",
  "eval-optimize": "evaluations",
  flagger: "flaggers",
  "flagger-classify": "flaggers",
  "live-eval": "evaluations",
  "session-analysis": "moments",
  "signal-assign": "signals",
  // Retired label; rows from before promotion-time naming stay in the ledger for its retention window.
  "signal-create": "signals",
  "signal-promotion": "signals",
  "signal-refresh": "signals",
  "taxonomy-facet-extract": "behaviors",
  "taxonomy-name": "behaviors",
}

const isMeteringLabel = (value: string): value is BillingMeteringLabel =>
  (BILLING_METERING_LABELS as readonly string[]).includes(value)

/**
 * Trace and eval-scan rows are classified by action; AI rows by the metering label
 * their scope stamped as the third key segment.
 */
export const billingUsageCategoryFor = (input: {
  readonly action: ChargeableAction
  readonly meteringLabel: string | null
}): BillingUsageCategory => {
  switch (input.action) {
    case "trace":
      return "traces"
    case "eval-scan":
      return "evaluations"
    case "llm-call":
    case "semantic-query":
      return input.meteringLabel !== null && isMeteringLabel(input.meteringLabel)
        ? BILLING_METERING_LABEL_CATEGORIES[input.meteringLabel]
        : "other"
  }
}

export interface BillingUsageLedgerSummaryRow {
  readonly projectId: ProjectId
  readonly action: ChargeableAction
  /** Third idempotency-key segment for AI actions; `null` for trace and eval-scan rows. */
  readonly meteringLabel: string | null
  readonly credits: number
}

export interface BillingUsageBreakdownRow {
  readonly projectId: ProjectId
  readonly category: BillingUsageCategory
  readonly credits: number
}

export interface BillingUsageCategoryTotal {
  readonly category: BillingUsageCategory
  readonly credits: number
}

export interface BillingUsageProjectTotal {
  readonly projectId: ProjectId
  readonly credits: number
  readonly categories: readonly BillingUsageCategoryTotal[]
}

/** Folds ledger summary rows into one row per project and category, largest first. */
export const summarizeBillingUsageBreakdown = (
  rows: readonly BillingUsageLedgerSummaryRow[],
): readonly BillingUsageBreakdownRow[] => {
  const byProjectAndCategory = new Map<string, BillingUsageBreakdownRow>()

  for (const row of rows) {
    const category = billingUsageCategoryFor(row)
    const key = `${row.projectId}:${category}`
    const existing = byProjectAndCategory.get(key)
    byProjectAndCategory.set(key, {
      projectId: row.projectId,
      category,
      credits: (existing?.credits ?? 0) + row.credits,
    })
  }

  return [...byProjectAndCategory.values()].sort((a, b) => b.credits - a.credits)
}

const byCreditsDesc = <T extends { readonly credits: number }>(a: T, b: T) => b.credits - a.credits

/**
 * Category totals across projects, largest first. Credits the period counter holds
 * beyond what the ledger attributes are folded into "other" so the list adds up to
 * `consumedCredits`.
 */
export const summarizeBillingUsageByCategory = (
  rows: readonly BillingUsageBreakdownRow[],
  consumedCredits: number,
): readonly BillingUsageCategoryTotal[] => {
  const totals = new Map<BillingUsageCategory, number>()
  for (const row of rows) {
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.credits)
  }

  const attributed = [...totals.values()].reduce((sum, credits) => sum + credits, 0)
  const unattributed = consumedCredits - attributed
  if (unattributed > 0) {
    totals.set("other", (totals.get("other") ?? 0) + unattributed)
  }

  return BILLING_USAGE_CATEGORIES.flatMap((category) => {
    const credits = totals.get(category) ?? 0
    return credits > 0 ? [{ category, credits }] : []
  }).sort(byCreditsDesc)
}

/** Per-project totals with each project's own category split, largest first. */
export const summarizeBillingUsageByProject = (
  rows: readonly BillingUsageBreakdownRow[],
): readonly BillingUsageProjectTotal[] => {
  const byProject = new Map<ProjectId, BillingUsageBreakdownRow[]>()
  for (const row of rows) {
    const existing = byProject.get(row.projectId)
    if (existing) existing.push(row)
    else byProject.set(row.projectId, [row])
  }

  return [...byProject.entries()]
    .map(([projectId, projectRows]) => {
      const categories = projectRows
        .map((row) => ({ category: row.category, credits: row.credits }))
        .sort(byCreditsDesc)
      return {
        projectId,
        credits: categories.reduce((sum, entry) => sum + entry.credits, 0),
        categories,
      }
    })
    .sort(byCreditsDesc)
}

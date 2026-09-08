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

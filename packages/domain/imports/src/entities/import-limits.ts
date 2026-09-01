import type { PlanSlug } from "@domain/billing"
import {
  IMPORT_DEFAULT_LOOKBACK_DAYS,
  IMPORT_HARD_MAX_TRACES,
  IMPORT_MAX_LOOKBACK_DAYS,
  IMPORT_MIN_LOOKBACK_DAYS,
} from "../constants.ts"

export interface ImportPlanUsage {
  readonly planSlug: PlanSlug
  /** How long this plan keeps spans. Older history would be deleted, so it bounds the range. */
  readonly retentionDays: number
  /** When this period's usage resets, which is when a job paused on usage can carry on. */
  readonly periodEnd: Date
}

export interface ImportLimits extends ImportPlanUsage {
  readonly minLookbackDays: number
  readonly maxLookbackDays: number
  readonly defaultLookbackDays: number
  readonly maxTraces: number
  readonly defaultMaxTraces: number
  /** True when retention, not the 365-day product cap, is what limits the range. */
  readonly lookbackLimitedByRetention: boolean
}

/**
 * What an org can actually ask for right now.
 *
 * Only retention narrows the product-wide caps: ClickHouse drops spans past
 * `retention_days` measured from the span's own start time, so importing older history
 * would bill for rows that get deleted.
 *
 * The trace count is deliberately not narrowed by plan usage. An imported trace meters
 * exactly like an ingested one, so an org that runs out mid-import has its job paused by
 * the same gate live ingestion answers to — budgeting the whole batch up front would mean
 * estimating what a trace costs downstream, and being wrong about it in the user's face.
 *
 * Pure so the wizard and `createImportUseCase` cannot disagree about the ceiling.
 */
export const resolveImportLimits = (usage: ImportPlanUsage): ImportLimits => {
  const maxLookbackDays = Math.max(IMPORT_MIN_LOOKBACK_DAYS, Math.min(IMPORT_MAX_LOOKBACK_DAYS, usage.retentionDays))

  return {
    ...usage,
    minLookbackDays: IMPORT_MIN_LOOKBACK_DAYS,
    maxLookbackDays,
    defaultLookbackDays: Math.min(IMPORT_DEFAULT_LOOKBACK_DAYS, maxLookbackDays),
    maxTraces: IMPORT_HARD_MAX_TRACES,
    defaultMaxTraces: IMPORT_HARD_MAX_TRACES,
    lookbackLimitedByRetention: usage.retentionDays < IMPORT_MAX_LOOKBACK_DAYS,
  }
}

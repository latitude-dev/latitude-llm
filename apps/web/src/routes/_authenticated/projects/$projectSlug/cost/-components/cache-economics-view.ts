import type { CacheModelJudgment, CacheState } from "@domain/spans"
import { CACHE_CEILING_LIFETIME_SECONDS } from "@domain/spans"
import type { CacheModelRecord } from "../../../../../../domains/cost/cost.functions.ts"

/** The three states that render a recommendation, in the order the cards read best. */
const CACHE_RECOMMENDATION_STATES = ["cacheIt", "stopCaching", "investigate"] as const
export type CacheRecommendationState = (typeof CACHE_RECOMMENDATION_STATES)[number]

/**
 * Which cache lifetime the panel is reading against. `documented` is each row's own
 * provider-documented value and the only setting whose verdicts may drive a card — any
 * number here is the reader's assumption, not our assessment.
 */
export type CacheLifetimeSelection = "documented" | number

export const CACHE_LIFETIME_OPTIONS: readonly CacheLifetimeSelection[] = [
  "documented",
  ...CACHE_CEILING_LIFETIME_SECONDS,
]

export const parseCacheLifetimeSelection = (value: string | undefined): CacheLifetimeSelection => {
  if (!value || value === "documented") return "documented"
  const seconds = Number(value)
  return CACHE_CEILING_LIFETIME_SECONDS.includes(seconds) ? seconds : "documented"
}

/**
 * One row flattened against the selected lifetime, so every rendering path reads the
 * same shape whichever lifetime is in view.
 *
 * `judgment` is always a precomputed one — the server priced every offered lifetime
 * from the registry, which the browser entry cannot reach, so switching is a lookup.
 */
export interface CacheRowView extends CacheModelRecord {
  readonly judgment: CacheModelJudgment
  /** The lifetime `judgment` assumes, or null when the row has none documented. */
  readonly lifetimeSeconds: number | null
  /** Whether `judgment` came from the row's own documented lifetime rather than a chosen one. */
  readonly isDocumented: boolean
}

export function resolveCacheRow(row: CacheModelRecord, selection: CacheLifetimeSelection): CacheRowView {
  if (selection === "documented") {
    return {
      ...row,
      judgment: row.documented,
      lifetimeSeconds: row.documentedLifetimeSeconds,
      isDocumented: true,
    }
  }
  const judgment = row.byLifetimeSeconds[selection]
  if (!judgment) {
    return { ...row, judgment: row.documented, lifetimeSeconds: row.documentedLifetimeSeconds, isDocumented: true }
  }
  return { ...row, judgment, lifetimeSeconds: selection, isDocumented: false }
}

/**
 * Highest modeled savings first, so the rows worth acting on rise and the three states
 * that carry no savings sink on their own. That is what replaces a "hide the healthy
 * ones" toggle: `Optimal`, `Correctly off` and `Not enough data` have nothing to sort
 * by, so they end up below every finding without being filtered out.
 *
 * Spend breaks the tie, which keeps the untouched order of a table with no findings
 * identical to the spend ranking the query already applied.
 */
export function sortCacheRowsBySavings(rows: readonly CacheRowView[]): readonly CacheRowView[] {
  return [...rows].sort((a, b) => {
    const savingsA = a.judgment.modeledSavingsMicrocents ?? -1
    const savingsB = b.judgment.modeledSavingsMicrocents ?? -1
    if (savingsA !== savingsB) return savingsB - savingsA
    return b.costMicrocents - a.costMicrocents
  })
}

export interface CacheFindingSection {
  readonly state: CacheRecommendationState
  /** Worth acting on, highest savings first. */
  readonly rows: readonly CacheRowView[]
  /** Real findings whose money is too small to lead with, counted rather than listed. */
  readonly quietCount: number
  readonly savingsMicrocents: number
}

/**
 * The findings, grouped by the state that says what to do about them, and ordered so the
 * most money comes first.
 *
 * The spend floor decides emphasis here rather than admission: a finding under it is a
 * real finding on cheap traffic, so it is counted rather than dropped. Dropping it would
 * leave the panel claiming a model is fine when we know it is not.
 */
export function buildCacheFindings(
  rows: readonly CacheModelRecord[],
  selection: CacheLifetimeSelection,
): readonly CacheFindingSection[] {
  const resolved = rows.map((row) => resolveCacheRow(row, selection))
  return CACHE_RECOMMENDATION_STATES.flatMap((state) => {
    const matching = resolved.filter((row) => row.judgment.state === state)
    const worthLeadingWith = sortCacheRowsBySavings(matching.filter((row) => row.judgment.savingsClearsFloor))
    if (matching.length === 0) return []
    return [
      {
        state,
        rows: worthLeadingWith,
        quietCount: matching.length - worthLeadingWith.length,
        savingsMicrocents: worthLeadingWith.reduce((sum, row) => sum + (row.judgment.modeledSavingsMicrocents ?? 0), 0),
      },
    ]
  }).sort((a, b) => b.savingsMicrocents - a.savingsMicrocents)
}

/** The models with nothing to do, counted so the panel can say so in one line. */
export function summariseSettledRows(
  rows: readonly CacheModelRecord[],
  selection: CacheLifetimeSelection,
): { readonly fine: number; readonly needData: number } {
  const states = rows.map((row) => resolveCacheRow(row, selection).judgment.state)
  return {
    fine: states.filter((state) => state === "optimal" || state === "correctlyOff").length,
    needData: states.filter((state) => state === "notEnoughData").length,
  }
}

/**
 * The share of this model's recorded spend the finding could recover.
 *
 * One encoding for every state, which rate cannot manage: a bar of unused headroom means
 * nothing for `Stop caching`, where the ceiling is zero and the money is a write premium
 * being paid for nothing. Money is the same quantity in all three cases.
 *
 * Clamped because the two figures come from different places. Savings are modeled from
 * tokens and registry prices; spend is what was recorded, output included. They can
 * disagree on a row the provider priced oddly.
 */
export function recoverableShare(row: CacheRowView): number | null {
  const savings = row.judgment.modeledSavingsMicrocents
  if (savings === null || !(row.costMicrocents > 0)) return null
  return Math.min(1, Math.max(0, savings / row.costMicrocents))
}

/**
 * What each section asks for, in one line.
 *
 * `Investigate` names the category and stops there. Every cache lever lives in the
 * customer's own prompt-construction code, and comparing prefixes byte by byte is
 * something the providers' own cache diagnostics do better, with access we do not have.
 */
export const CACHE_RECOMMENDATION_COPY: Record<
  CacheRecommendationState,
  { readonly title: string; readonly body: string }
> = {
  cacheIt: {
    title: "Cache it",
    body: "Caching is off on prompts that repeat enough to pay for it.",
  },
  stopCaching: {
    title: "Stop caching",
    body: "These calls pay to write a cache that expires before anything reads it.",
  },
  investigate: {
    title: "Investigate",
    body: "Something in these prompts changes between calls, so the cache is rarely hit.",
  },
}

/** Whether a state carries a savings figure at all, which is what the blank cell means. */
export const cacheStateIsActionable = (state: CacheState): state is CacheRecommendationState =>
  CACHE_RECOMMENDATION_STATES.some((actionable) => actionable === state)

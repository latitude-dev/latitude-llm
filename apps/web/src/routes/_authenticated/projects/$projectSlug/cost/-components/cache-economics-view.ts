import type { CacheModelJudgment, CacheState } from "@domain/spans"
import { CACHE_CEILING_LIFETIME_SECONDS } from "@domain/spans"
import type { CacheModelRecord } from "../../../../../../domains/cost/cost.functions.ts"

/** The three states that ask the reader for something, in the order they read best. */
const CACHE_RECOMMENDATION_STATES = ["cacheIt", "stopCaching", "investigate"] as const
type CacheRecommendationState = (typeof CACHE_RECOMMENDATION_STATES)[number]

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

/**
 * Every state present, as a group the table can put a heading on.
 *
 * One representation rather than two. A separate findings list beside a table meant the
 * same rows rendered twice with different encodings, which is what made a reader ask why
 * three particular models were called out.
 */
export interface CacheStateGroup {
  readonly state: CacheState
  /** Every row in this state, highest savings first. */
  readonly rows: readonly CacheRowView[]
  /** Whether the state asks for something. Settled states stay hidden until expanded. */
  readonly isActionable: boolean
  /** Only what clears the floor, so a group of pennies does not inflate the headline. */
  readonly savingsMicrocents: number
}

/** Settled states in the order they read once someone expands the table. */
const CACHE_SETTLED_ORDER: readonly CacheState[] = ["optimal", "correctlyOff", "notEnoughData"]

/**
 * Groups ordered so the money leads: states that ask for something first, by how much they
 * would save, then the states that ask for nothing.
 */
export function buildCacheStateGroups(
  rows: readonly CacheModelRecord[],
  selection: CacheLifetimeSelection,
): readonly CacheStateGroup[] {
  const resolved = rows.map((row) => resolveCacheRow(row, selection))
  const byState = new Map<CacheState, CacheRowView[]>()
  for (const row of resolved) {
    byState.set(row.judgment.state, [...(byState.get(row.judgment.state) ?? []), row])
  }

  const group = (state: CacheState): CacheStateGroup | null => {
    const stateRows = byState.get(state)
    if (!stateRows || stateRows.length === 0) return null
    return {
      state,
      rows: sortCacheRowsBySavings(stateRows),
      isActionable: cacheStateIsActionable(state),
      savingsMicrocents: stateRows.reduce(
        (sum, row) => sum + (row.judgment.savingsClearsFloor ? (row.judgment.modeledSavingsMicrocents ?? 0) : 0),
        0,
      ),
    }
  }

  const actionable = CACHE_RECOMMENDATION_STATES.map(group)
    .filter((entry): entry is CacheStateGroup => entry !== null)
    .sort((a, b) => b.savingsMicrocents - a.savingsMicrocents)
  const settled = CACHE_SETTLED_ORDER.map(group).filter((entry): entry is CacheStateGroup => entry !== null)

  return [...actionable, ...settled]
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
 * Whether a state asks for something, which is what decides whether its group is on screen
 * before the reader expands the table.
 *
 * `Investigate` names the category and stops there. Every cache lever lives in the
 * customer's own prompt-construction code, and comparing prefixes byte by byte is something
 * the providers' own cache diagnostics do better, with access we do not have.
 */
export const cacheStateIsActionable = (state: CacheState): state is CacheRecommendationState =>
  CACHE_RECOMMENDATION_STATES.some((actionable) => actionable === state)

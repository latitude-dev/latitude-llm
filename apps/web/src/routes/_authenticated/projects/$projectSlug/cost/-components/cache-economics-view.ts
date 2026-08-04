import type { CacheModelJudgment, CacheState, CacheUsageMeasures } from "@domain/spans"
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
 * The headings the table can carry, in the order they read before anyone sorts.
 *
 * `correctlyOff` and `notEnoughData` share one: both ask nothing of the reader and both
 * render an empty bar, so two headings for them was two ways of saying nothing. Which of
 * the two a row is stays in its own tooltip, where someone who cares can find it.
 */
const CACHE_GROUPS = [
  { key: "cacheIt", states: ["cacheIt"] },
  { key: "stopCaching", states: ["stopCaching"] },
  { key: "investigate", states: ["investigate"] },
  { key: "optimal", states: ["optimal"] },
  { key: "nothingToDo", states: ["correctlyOff", "notEnoughData"] },
] as const satisfies readonly { key: string; states: readonly CacheState[] }[]

export type CacheGroupKey = (typeof CACHE_GROUPS)[number]["key"]

/** Which heading a row's raw state falls under, for a table that lists rows flat. */
export function cacheGroupKeyForState(state: CacheState): CacheGroupKey {
  switch (state) {
    case "cacheIt":
      return "cacheIt"
    case "stopCaching":
      return "stopCaching"
    case "investigate":
      return "investigate"
    case "optimal":
      return "optimal"
    case "correctlyOff":
    case "notEnoughData":
      return "nothingToDo"
  }
}

/**
 * Every group present, as the table renders it.
 *
 * One representation rather than two. A separate findings list beside a table meant the
 * same rows rendered twice with different encodings, which is what made a reader ask why
 * three particular models were called out.
 */
export interface CacheStateGroup {
  readonly key: CacheGroupKey
  /** Every row under this heading, highest savings first. */
  readonly rows: readonly CacheRowView[]
  /** Whether the heading asks for something. The rest stay hidden until expanded. */
  readonly isActionable: boolean
  /**
   * Every row's savings, floor or no floor, so the headline is the sum of the column a
   * reader can add up themselves.
   *
   * Excluding the rows under the floor made the headline non-monotonic in the time window:
   * the floor is a weekly *rate*, so the same dollars clear $1/week over two weeks and miss
   * it over thirty days, and two weeks reported more recoverable money than the month
   * containing it. The floor's job is deciding what to recommend, not what to add up.
   */
  readonly savingsMicrocents: number
}

/**
 * Groups ordered so the money leads: the headings that ask for something first, by how much
 * they would save, then the ones that ask for nothing.
 */
export function buildCacheStateGroups(
  rows: readonly CacheModelRecord[],
  selection: CacheLifetimeSelection,
): readonly CacheStateGroup[] {
  const resolved = rows.map((row) => resolveCacheRow(row, selection))

  const group = (entry: (typeof CACHE_GROUPS)[number]): CacheStateGroup | null => {
    const groupRows = resolved.filter((row) => (entry.states as readonly CacheState[]).includes(row.judgment.state))
    if (groupRows.length === 0) return null
    return {
      key: entry.key,
      rows: sortCacheRowsBySavings(groupRows),
      isActionable: cacheStateIsActionable(entry.states[0]),
      savingsMicrocents: groupRows.reduce((sum, row) => sum + (row.judgment.modeledSavingsMicrocents ?? 0), 0),
    }
  }

  const groups = CACHE_GROUPS.map(group).filter((entry): entry is CacheStateGroup => entry !== null)
  const actionable = groups
    .filter((entry) => entry.isActionable)
    .sort((a, b) => b.savingsMicrocents - a.savingsMicrocents)

  return [...actionable, ...groups.filter((entry) => !entry.isActionable)]
}

/**
 * The models asking nothing of the reader, counted so the collapsed panel can say so in one
 * line. `optimal` is kept apart from the rest because it is the only one that is praise —
 * a model with caching off is not "caching well", however right it is to leave it off.
 */
export function summariseSettledRows(
  rows: readonly CacheModelRecord[],
  selection: CacheLifetimeSelection,
): { readonly cachingWell: number; readonly nothingToDo: number } {
  const states = rows.map((row) => resolveCacheRow(row, selection).judgment.state)
  return {
    cachingWell: states.filter((state) => state === "optimal").length,
    nothingToDo: states.filter((state) => state === "correctlyOff" || state === "notEnoughData").length,
  }
}

/**
 * The whole panel in the few numbers a reader can hold at once: what is on the table, where
 * it is, and how the project is doing overall.
 */
export interface CacheSummary {
  readonly recoverableMicrocents: number
  /** Against recorded spend in the window, so it is comparable with the rest of the page. */
  readonly recoverableShareOfSpend: number | null
  readonly findings: readonly CacheStateGroup[]
  /** Measured across the whole project: cache reads over every input-side token. */
  readonly actualRate: number | null
  /**
   * The same ceiling the table draws, weighted by each model's tokens — and over only the
   * models whose cadence we could measure, which `measuredTokenShare` reports. A model with
   * no ceiling would otherwise have to count as either 0% or 100%, and both are inventions.
   */
  readonly ceilingRate: number | null
  readonly measuredTokenShare: number
  readonly cachingWell: number
  readonly nothingToDo: number
}

export function buildCacheSummary({
  rows,
  totals,
  selection,
}: {
  readonly rows: readonly CacheModelRecord[]
  readonly totals: CacheUsageMeasures
  readonly selection: CacheLifetimeSelection
}): CacheSummary {
  const groups = buildCacheStateGroups(rows, selection)
  const findings = groups.filter((group) => group.isActionable)
  const totalTokens = totals.inputTokens + totals.cacheReadTokens + totals.cacheCreateTokens

  let measuredTokens = 0
  let warmTokens = 0
  for (const row of rows.map((entry) => resolveCacheRow(entry, selection))) {
    if (row.judgment.ceilingRate === null) continue
    const tokens = row.inputTokens + row.cacheReadTokens + row.cacheCreateTokens
    measuredTokens += tokens
    warmTokens += tokens * row.judgment.ceilingRate
  }

  const recoverableMicrocents = findings.reduce((sum, group) => sum + group.savingsMicrocents, 0)

  return {
    recoverableMicrocents,
    recoverableShareOfSpend:
      totals.costMicrocents > 0 ? Math.min(1, recoverableMicrocents / totals.costMicrocents) : null,
    findings,
    actualRate: totalTokens > 0 ? totals.cacheReadTokens / totalTokens : null,
    ceilingRate: measuredTokens > 0 ? warmTokens / measuredTokens : null,
    measuredTokenShare: totalTokens > 0 ? measuredTokens / totalTokens : 0,
    ...summariseSettledRows(rows, selection),
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

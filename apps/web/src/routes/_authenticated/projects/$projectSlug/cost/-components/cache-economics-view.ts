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

export interface CacheRecommendation {
  readonly state: CacheRecommendationState
  readonly rows: readonly CacheRowView[]
  readonly savingsMicrocents: number
}

/**
 * The findings worth a card, which is a narrower set than the findings worth a table
 * row: a state is only promoted once its modeled savings clear the weekly spend floor.
 * A model can therefore legitimately show `Cache it` in the table and no card — its
 * cadence supports caching, but the money behind it is noise.
 *
 * Always built from each row's **documented** judgment, never from a chosen lifetime.
 * A recommendation drawn from a number the reader typed in would be their assumption
 * wearing our voice, and the signals pipeline that will consume these findings has to
 * agree with the panel about the same model.
 */
export function groupCacheRecommendations(rows: readonly CacheModelRecord[]): readonly CacheRecommendation[] {
  const documented = rows.map((row) => resolveCacheRow(row, "documented"))
  return CACHE_RECOMMENDATION_STATES.flatMap((state) => {
    const matching = sortCacheRowsBySavings(
      documented.filter((row) => row.judgment.state === state && row.judgment.savingsClearsFloor),
    )
    if (matching.length === 0) return []
    return [
      {
        state,
        rows: matching,
        savingsMicrocents: matching.reduce((sum, row) => sum + (row.judgment.modeledSavingsMicrocents ?? 0), 0),
      },
    ]
  })
}

/**
 * What the card asks for. `Investigate` deliberately stops at naming the category
 * rather than prescribing a fix: every cache lever lives in the customer's own
 * prompt-construction code, and byte-level prefix comparison is something the
 * providers' own cache diagnostics do better and with access we do not have.
 */
export const CACHE_RECOMMENDATION_COPY: Record<
  CacheRecommendationState,
  { readonly title: string; readonly body: string }
> = {
  cacheIt: {
    title: "Cache it",
    body: "Caching is off on traffic whose cadence could serve most of its prompt from cache, on a model where a miss costs no more than plain input. Mark the stable prefix as cacheable.",
  },
  stopCaching: {
    title: "Stop caching",
    body: "Every write is being paid for and the calls arrive too far apart for any of them to be read back before they expire. Turning caching off is the cheaper setup for this traffic.",
  },
  investigate: {
    title: "Investigate",
    body: "The cadence supports a much higher hit rate than these calls are getting, so something ahead of the cache breakpoint is changing between calls. Check for a timestamp or request id in the prefix, and for key-ordering determinism if the prompt is serialised from Swift or Go.",
  },
}

/** Whether a state carries a savings figure at all, which is what the blank cell means. */
export const cacheStateIsActionable = (state: CacheState): state is CacheRecommendationState =>
  CACHE_RECOMMENDATION_STATES.some((actionable) => actionable === state)

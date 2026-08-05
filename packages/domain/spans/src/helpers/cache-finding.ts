/**
 * Which cache verdicts are worth waking someone up for, and which are only worth a
 * table row.
 *
 * The dashboard and the signal producer both read this module, so the panel and the
 * signals inbox cannot end up disagreeing about the same model. It sits on top of
 * `classifyCacheState` rather than beside it: the state is the judgment, and what
 * follows is only about whether the judgment is load-bearing enough to spend an
 * engineer's afternoon and a coding agent's tokens on.
 *
 * Every gate here fails closed. A missed opportunity costs nothing visible; a wrong
 * finding dispatches an agent at something that may be unfixable, and one of those
 * discredits every recommendation after it.
 *
 * Nothing here reads the registry or a clock, so the whole gate is browser-safe and
 * every branch is reachable from a unit test.
 */

import type { CacheState, CacheUrgency } from "./cache-economics.ts"
import type { CacheModelJudgment, JudgedCacheModel } from "./judge-cache-economics.ts"

/** The three states that ask for something. The other three never produce a finding. */
export const CACHE_SIGNAL_STATES = ["cacheIt", "stopCaching", "investigate"] as const
export type CacheSignalState = (typeof CACHE_SIGNAL_STATES)[number]

/**
 * Calls a model needs in one evaluation window before its rate may fire a signal.
 *
 * Five times the panel's `CACHE_ECONOMICS_MIN_CALLS`. Twenty calls is enough to stop a
 * quotient being a one-sample artefact, which is all a table row has to survive; it is
 * not enough to conclude that a *cadence* is stable enough to dispatch an agent at.
 *
 * It cannot go much higher without quietly deleting a state. `stopCaching` needs a ceiling
 * under break-even, which for every provider that charges for writes means almost no call
 * arriving within its cache lifetime of another — and that same cadence caps how many
 * calls a week there can be. A floor of a few hundred would make the one recommendation
 * that saves money without touching the hit rate unreachable, and nothing would say so.
 */
export const CACHE_SIGNAL_MIN_CALLS = 100

/** Length of one stability window. Weekly, so the floors are read at the scale they are defined at. */
export const CACHE_SIGNAL_WINDOW_DAYS = 7

/**
 * Consecutive windows that must return the same finding before it fires.
 *
 * This is the gate that stops a signal flapping on and off while every individual
 * evaluation stays defensible — a rate sitting on a threshold crosses it most weeks by
 * chance, and a signal that reopens every other day is a false-positive generator
 * however sound each run was. Three weeks of agreement is cheap to wait for and
 * expensive to produce by accident.
 */
export const CACHE_SIGNAL_STABILITY_WINDOWS = 3

/**
 * Why a verdict that renders in the panel did not become a signal. Reported rather
 * than dropped so the QA fixtures can assert *which* gate held, not merely that
 * nothing fired — a finding suppressed by the wrong gate is a bug the count hides.
 */
export const CACHE_FINDING_SUPPRESSIONS = [
  /** State asks nothing of the reader: optimal, correctlyOff, notEnoughData. */
  "notActionable",
  "sampleFloor",
  "spendFloor",
  /** No provider documentation covers the pair, so we cannot say the gap is reachable. */
  "unknownCeiling",
  /** The verdict changes across the lifetimes the provider could plausibly be running. */
  "lifetimeAmbiguous",
  /** The finding did not hold across `CACHE_SIGNAL_STABILITY_WINDOWS`. */
  "unstable",
] as const
export type CacheFindingSuppression = (typeof CACHE_FINDING_SUPPRESSIONS)[number]

/**
 * Everything a consumer needs to state the finding and act on it, and nothing that
 * needs a second read to interpret.
 *
 * This is the shape a dispatched coding agent receives and the shape an API operation
 * would expose, so exposure stays a mapping rather than a redesign. Rates are exactly
 * measured; `modeledSavingsMicrocents` is modeled from tokens times registry prices and
 * will not tie to recorded spend.
 */
export interface CacheFindingMeasures {
  readonly provider: string
  readonly model: string
  readonly state: CacheSignalState
  readonly urgency: CacheUrgency | null
  readonly actualRate: number
  readonly breakEvenRate: number
  readonly ceilingRate: number
  readonly modeledSavingsMicrocents: number
  readonly calls: number
  /** Recorded spend for this model over the window, the authoritative total. */
  readonly spendMicrocents: number
  /**
   * The provider-documented cache lifetime the ceiling assumes. Never a lifetime a
   * reader selected: that is their assumption, and dispatching an agent on it would
   * spend their tokens against a number someone typed into a dropdown.
   */
  readonly cacheLifetimeSeconds: number
}

export type CacheFindingEvaluation =
  | { readonly fires: true; readonly measures: CacheFindingMeasures }
  | { readonly fires: false; readonly suppressedBy: CacheFindingSuppression }

const isSignalState = (state: CacheState): state is CacheSignalState =>
  CACHE_SIGNAL_STATES.some((candidate) => candidate === state)

/**
 * Whether one window's verdict for one model clears every gate but stability.
 *
 * Reads `documented` and only `documented`. The panel's lifetime control recomputes the
 * whole judgment at each offered lifetime so a reader can explore; none of those
 * verdicts may reach here.
 */
export function evaluateCacheFinding(row: JudgedCacheModel): CacheFindingEvaluation {
  const judgment: CacheModelJudgment = row.documented
  if (!isSignalState(judgment.state)) return { fires: false, suppressedBy: "notActionable" }
  if (row.calls < CACHE_SIGNAL_MIN_CALLS) return { fires: false, suppressedBy: "sampleFloor" }

  // The achievable-ceiling gate. Without a ceiling we cannot say this agent's own
  // cadence makes the gap reachable, which is the entire premise of dispatching at it.
  // `investigate/overpaying` is reachable with a null ceiling, so this is load-bearing
  // rather than implied by the state.
  if (judgment.ceilingRate === null) return { fires: false, suppressedBy: "unknownCeiling" }
  if (judgment.breakEvenRate === null || judgment.actualRate === null) {
    return { fires: false, suppressedBy: "unknownCeiling" }
  }
  if (row.documentedLifetimeSeconds === null) return { fires: false, suppressedBy: "unknownCeiling" }

  // Two plausible lifetimes disagreeing about the verdict means we do not know the
  // verdict. The documented table only ever understates, so this is the case where its
  // safe error direction has run out.
  if (row.verdictDependsOnLifetime) return { fires: false, suppressedBy: "lifetimeAmbiguous" }

  if (!judgment.savingsClearsFloor || judgment.modeledSavingsMicrocents === null) {
    return { fires: false, suppressedBy: "spendFloor" }
  }

  return {
    fires: true,
    measures: {
      provider: row.provider,
      model: row.model,
      state: judgment.state,
      urgency: judgment.urgency,
      actualRate: judgment.actualRate,
      breakEvenRate: judgment.breakEvenRate,
      ceilingRate: judgment.ceilingRate,
      modeledSavingsMicrocents: judgment.modeledSavingsMicrocents,
      calls: row.calls,
      spendMicrocents: row.costMicrocents,
      cacheLifetimeSeconds: row.documentedLifetimeSeconds,
    },
  }
}

/** Longest a fingerprint may be, matching the `cost_findings.fingerprint` column. */
export const CACHE_FINDING_FINGERPRINT_MAX_LENGTH = 200

const fingerprintPart = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .slice(0, 64)

/**
 * Stable identity of a finding, and the dedupe key of the signal it opens.
 *
 * The state is part of the identity on purpose: `Investigate` becoming `Stop caching` is
 * a different recommendation with a different fix, so it deserves its own signal rather
 * than a silent edit to one someone has already read.
 */
export function cacheFindingFingerprint(input: {
  readonly provider: string
  readonly model: string
  readonly state: CacheSignalState
}): string {
  return `cache:${fingerprintPart(input.provider)}:${fingerprintPart(input.model)}:${input.state}`.slice(
    0,
    CACHE_FINDING_FINGERPRINT_MAX_LENGTH,
  )
}

const DAY_MS = 24 * 60 * 60 * 1000

/** One stability window's bounds: `from` inclusive, `to` exclusive, as the repository reads them. */
export interface CacheFindingWindow {
  readonly from: Date
  readonly to: Date
}

/**
 * The windows one stability evaluation reads, newest first.
 *
 * Snapped to UTC midnight so two runs on the same day judge exactly the same slices and
 * the sync is idempotent within a day. The partial current day is excluded rather than
 * scaled up: the spend floor is a weekly rate, and a window six hours into today would
 * otherwise report a sixth of a week's savings as if it were the week's.
 */
export function cacheFindingWindows(anchor: Date): readonly CacheFindingWindow[] {
  const endMs = Math.floor(anchor.getTime() / DAY_MS) * DAY_MS
  const spanMs = CACHE_SIGNAL_WINDOW_DAYS * DAY_MS
  return Array.from({ length: CACHE_SIGNAL_STABILITY_WINDOWS }, (_, index) => ({
    from: new Date(endMs - (index + 1) * spanMs),
    to: new Date(endMs - index * spanMs),
  }))
}

const pairKey = (row: { readonly provider: string; readonly model: string }): string => `${row.provider} ${row.model}`

export interface StableCacheFinding {
  readonly fingerprint: string
  readonly measures: CacheFindingMeasures
}

export interface SuppressedCacheFinding {
  readonly provider: string
  readonly model: string
  readonly state: CacheState
  readonly suppressedBy: CacheFindingSuppression
}

export interface CacheFindingReview {
  readonly findings: readonly StableCacheFinding[]
  readonly suppressed: readonly SuppressedCacheFinding[]
}

/**
 * The findings worth firing, from the same model judged over several consecutive
 * windows.
 *
 * `windows` runs newest first and each entry is one `judgeCacheEconomics` result over
 * one `CACHE_SIGNAL_WINDOW_DAYS` slice. A finding survives only when every window
 * returns it with the same state, so hysteresis is derived from the data rather than
 * from stored counters — the same history always yields the same decision, with nothing
 * to backfill or corrupt.
 *
 * Fewer windows than `CACHE_SIGNAL_STABILITY_WINDOWS` returns nothing at all: a project
 * younger than the stability requirement has not earned a finding yet.
 */
export function reviewCacheFindings(windows: readonly (readonly JudgedCacheModel[])[]): CacheFindingReview {
  const current = windows[0]
  if (current === undefined || windows.length < CACHE_SIGNAL_STABILITY_WINDOWS) {
    return { findings: [], suppressed: [] }
  }

  const history = windows
    .slice(0, CACHE_SIGNAL_STABILITY_WINDOWS)
    .map((rows) => new Map(rows.map((row) => [pairKey(row), evaluateCacheFinding(row)] as const)))

  const findings: StableCacheFinding[] = []
  const suppressed: SuppressedCacheFinding[] = []

  for (const row of current) {
    const evaluated = evaluateCacheFinding(row)
    if (!evaluated.fires) {
      suppressed.push({
        provider: row.provider,
        model: row.model,
        state: row.documented.state,
        suppressedBy: evaluated.suppressedBy,
      })
      continue
    }

    const holds = history.every((window) => {
      const past = window.get(pairKey(row))
      return past !== undefined && past.fires && past.measures.state === evaluated.measures.state
    })
    if (!holds) {
      suppressed.push({
        provider: row.provider,
        model: row.model,
        state: row.documented.state,
        suppressedBy: "unstable",
      })
      continue
    }

    findings.push({
      fingerprint: cacheFindingFingerprint({
        provider: row.provider,
        model: row.model,
        state: evaluated.measures.state,
      }),
      measures: evaluated.measures,
    })
  }

  return { findings, suppressed }
}

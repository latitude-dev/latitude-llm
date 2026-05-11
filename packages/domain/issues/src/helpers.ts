import type { EntrySignalsSnapshot } from "@domain/alerts"
import type { IssueEscalationSignals, ScoreSource } from "@domain/scores"
import {
  CENTROID_EMBEDDING_DIMENSIONS,
  CENTROID_EMBEDDING_MODEL,
  CENTROID_HALF_LIFE_SECONDS,
  CENTROID_SOURCE_WEIGHTS,
  ESCALATION_ABSOLUTE_RATE_EXIT_FACTOR,
  ESCALATION_EXIT_DWELL_MS,
  ESCALATION_EXIT_THRESHOLD_FACTOR,
  ESCALATION_MAX_DURATION_MS,
  ESCALATION_MIN_OCCURRENCES_THRESHOLD,
  ESCALATION_THRESHOLD_FACTOR,
  ISSUE_STATES,
  MIN_SEASONAL_SAMPLES,
  NEW_ISSUE_AGE_DAYS,
} from "./constants.ts"
import { type Issue, type IssueCentroid, IssueState, type IssueState as IssueStateValue } from "./entities/issue.ts"

const MILLISECONDS_PER_SECOND = 1000
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

const zeroVector = (dimensions: number) => new Array<number>(dimensions).fill(0)

function l2Norm(vector: ArrayLike<number>): number {
  let sum = 0
  for (let index = 0; index < vector.length; index++) {
    const value = vector[index] ?? 0
    sum += value * value
  }
  return Math.sqrt(sum)
}

/**
 * Shared L2-normalization primitive for centroid math.
 * Writes into a caller-provided buffer so the hot path can avoid extra arrays.
 */
function normalizeTo(out: Float32Array, src: ArrayLike<number>): void {
  const magnitude = l2Norm(src)
  const inverse = magnitude > 0 ? 1 / magnitude : 0

  for (let index = 0; index < src.length; index++) {
    out[index] = (src[index] ?? 0) * inverse
  }
}

function scaleInPlace(vector: Float32Array, scale: number): void {
  for (let index = 0; index < vector.length; index++) {
    vector[index] *= scale
  }
}

/**
 * Advance a persisted centroid state from `clusteredAt` to `timestamp`.
 * Used only by `updateIssueCentroid` before adding or removing one score
 * contribution, and mutates the working buffer in place for efficiency.
 */
function applyDecay(
  base: Float32Array,
  mass: number,
  clusteredAt: Date,
  timestamp: Date,
  halfLifeSeconds: number,
): number {
  const delta = timestamp.getTime() - clusteredAt.getTime()
  if (delta <= 0) {
    return mass
  }

  const halfLifeMilliseconds = halfLifeSeconds * MILLISECONDS_PER_SECOND
  const alpha = 0.5 ** (delta / halfLifeMilliseconds)
  scaleInPlace(base, alpha)
  return mass * alpha
}

/**
 * Create a brand-new issue centroid with the current discovery configuration.
 * Use this only when creating a new issue before it has any clustered scores.
 */
export const createIssueCentroid = (): IssueCentroid => ({
  base: zeroVector(CENTROID_EMBEDDING_DIMENSIONS),
  mass: 0,
  model: CENTROID_EMBEDDING_MODEL,
  decay: CENTROID_HALF_LIFE_SECONDS,
  weights: { ...CENTROID_SOURCE_WEIGHTS },
})

export interface UpdateIssueCentroidInput {
  readonly centroid: IssueCentroid & { clusteredAt: Date }
  readonly score: {
    readonly embedding: readonly number[]
    readonly source: ScoreSource
    readonly createdAt: Date
  }
  readonly operation: "add" | "remove"
  readonly timestamp: Date
}

/**
 * Canonical v2 centroid update step for issue membership changes.
 *
 * This is used when a score is attached to or removed from an issue: first
 * decay the stored running sum/mass from `clusteredAt`, then normalize the
 * score embedding, weight it by source and recency, and finally update the
 * persisted centroid state that will later be projected to Weaviate.
 */
export const updateIssueCentroid = ({
  centroid,
  score,
  operation,
  timestamp,
}: UpdateIssueCentroidInput): IssueCentroid & { clusteredAt: Date } => {
  if (centroid.base.length !== score.embedding.length) {
    throw new Error(`Dimension mismatch: centroid has ${centroid.base.length}, score has ${score.embedding.length}`)
  }

  const outBase = new Float32Array(centroid.base)
  let outMass = applyDecay(outBase, centroid.mass, centroid.clusteredAt, timestamp, centroid.decay)

  const halfLifeMilliseconds = centroid.decay * MILLISECONDS_PER_SECOND
  const elapsed = Math.max(0, timestamp.getTime() - score.createdAt.getTime())
  const recency = 0.5 ** (elapsed / halfLifeMilliseconds)
  const contributionMass = (centroid.weights[score.source] ?? 1) * recency

  const normalizedScore = new Float32Array(score.embedding.length)
  normalizeTo(normalizedScore, score.embedding)

  const sign = operation === "add" ? 1 : -1
  for (let index = 0; index < outBase.length; index++) {
    outBase[index] += sign * contributionMass * normalizedScore[index]
  }

  outMass = operation === "add" ? outMass + contributionMass : outMass - contributionMass
  if (outMass <= 0) {
    return {
      ...centroid,
      base: zeroVector(outBase.length),
      mass: 0,
      clusteredAt: timestamp,
    }
  }

  return {
    ...centroid,
    base: Array.from(outBase),
    mass: outMass,
    clusteredAt: timestamp,
  }
}

/**
 * Convert the persisted running sum into the unit vector used for cosine
 * search. Use this only when emitting an issue centroid to Weaviate or other
 * retrieval code; the stored centroid `base` itself stays unnormalized.
 */
export const normalizeIssueCentroid = (centroid: IssueCentroid): number[] => {
  if (centroid.mass <= 0 || centroid.base.length === 0) {
    return []
  }

  const normalized = new Float32Array(centroid.base)
  const magnitude = l2Norm(normalized)
  if (magnitude === 0) {
    return []
  }

  const inverse = 1 / magnitude
  for (let index = 0; index < normalized.length; index++) {
    normalized[index] *= inverse
  }

  return Array.from(normalized)
}

/**
 * Normalize a raw embedding for query-time cosine search.
 * Retrieval code uses this for incoming feedback/query embeddings, while
 * `updateIssueCentroid` handles normalization internally during state updates.
 */
export const normalizeEmbedding = (embedding: readonly number[]): number[] => {
  if (embedding.length === 0) {
    return []
  }

  const normalized = new Float32Array(embedding.length)
  normalizeTo(normalized, embedding)
  return Array.from(normalized)
}

export interface DeriveIssueLifecycleStatesInput {
  readonly issue: Issue
  /** Lifecycle flags joined from `alert_incidents` by `IssueRepository` reads. */
  readonly isEscalating: boolean
  readonly isRegressed: boolean
  readonly now?: Date
}

export const getEscalationOccurrenceThreshold = (baselineAvgOccurrences: number): number =>
  Math.max(
    ESCALATION_MIN_OCCURRENCES_THRESHOLD,
    Math.floor(Math.max(0, baselineAvgOccurrences) * ESCALATION_THRESHOLD_FACTOR) + 1,
  )

/**
 * Hysteresis exit threshold: an escalating issue exits only when its recent
 * occurrence count drops below this value. Always strictly less than
 * `getEscalationOccurrenceThreshold(baselineAvgOccurrences)` so the entry
 * and exit conditions cannot both hold simultaneously at the same baseline.
 */
export const getEscalationExitThreshold = (baselineAvgOccurrences: number): number =>
  Math.floor(getEscalationOccurrenceThreshold(baselineAvgOccurrences) * ESCALATION_EXIT_THRESHOLD_FACTOR)

/**
 * An issue is "new" while its first seen timestamp is within
 * `NEW_ISSUE_AGE_DAYS` of `now`. New issues are excluded from escalation
 * detection — their `baselineAvgOccurrences` window (days 1–8 ago) hasn't
 * filled in yet, so any volume above the floor would falsely trip the
 * threshold. The discrete `issue.new` alert covers this case.
 */
export const isIssueNew = (firstSeenAt: Date, now: Date = new Date()): boolean =>
  firstSeenAt.getTime() > now.getTime() - NEW_ISSUE_AGE_DAYS * MILLISECONDS_PER_DAY

// ---------------------------------------------------------------------------
// Seasonal escalation detector
// ---------------------------------------------------------------------------

/**
 * Effective sigma: combines the observed stddev with two floors to keep band
 * widths defensible at small sample sizes:
 *   - `√expected` is the Poisson lower bound for count data (Var ≈ mean).
 *   - `1.0` is a hard floor against `σ = 0` on quiet buckets — without it the
 *     first non-zero sample after a quiet stretch trips the detector.
 */
const sigmaEffective = (observed: number, expected: number): number =>
  Math.max(observed, Math.sqrt(Math.max(0, expected)), 1.0)

const snapshotFromSignals = (
  signals: IssueEscalationSignals,
  kShort: number,
  kLong: number,
  entryThreshold1h: number,
  entryThreshold6hPerHour: number,
): EntrySignalsSnapshot => ({
  expected1h: signals.expected1h,
  expected6hPerHour: signals.expected6hPerHour,
  stddev1h: signals.stddev1h,
  stddev6hPerHour: signals.stddev6hPerHour,
  kShort,
  kLong,
  entryThreshold1h,
  entryThreshold6hPerHour,
  entryCount24h: signals.recent24h,
})

export interface SeasonalEscalationDecisionInput {
  readonly signals: IssueEscalationSignals
  /**
   * User-facing sensitivity. Lower = noisier (trips more easily); higher =
   * quieter. `k_long = k_short − 1` is derived internally — the multi-window
   * SRE pattern needs distinct sensitivities so the short window doesn't
   * dominate the long one when they're nested inside each other.
   */
  readonly kShort: number
  readonly isNew: boolean
  readonly wasEscalating: boolean
  /**
   * Snapshot frozen at the moment of entry. `null` for legacy incidents
   * opened before the seasonal detector landed (or for incidents emitted by
   * the transitional `entrySignals = null` path during rollout). When null,
   * the absolute-rate backstop is skipped — only band-shape exit + timeout
   * apply.
   */
  readonly entrySignals: EntrySignalsSnapshot | null
  /** `null` when the incident isn't currently open (i.e. `wasEscalating === false`). */
  readonly startedAt: Date | null
  /**
   * Tracks the start of the band-shape exit dwell. `null` when the exit
   * shape isn't currently holding. The detector advances it on consecutive
   * checks until `now - exitEligibleSince >= ESCALATION_EXIT_DWELL_MS`, at
   * which point the incident closes via `reason: "threshold"`.
   */
  readonly exitEligibleSince: Date | null
  readonly now: Date
}

export type SeasonalEscalationTransition = "enter" | "exit" | "none"

export type SeasonalEscalationExitReason = "threshold" | "absolute-rate-drop" | "timeout"

export interface SeasonalEscalationDecision {
  readonly transition: SeasonalEscalationTransition
  /** Set on `transition: "exit"`. */
  readonly reason?: SeasonalEscalationExitReason
  /** Set on `transition: "enter"`. The caller forwards this to the outbox event. */
  readonly entrySignalsSnapshot?: EntrySignalsSnapshot
  /**
   * The next value the caller must persist on `alert_incidents.exit_eligible_since`.
   * `null` clears the dwell. Identical to the prior value when nothing changed
   * (caller should still write only when it differs).
   */
  readonly nextExitEligibleSince: Date | null
}

/**
 * Seasonal escalation decision function: pure mapping from the current
 * observed signals + persisted dwell/snapshot state to the next transition
 * and the caller's required mutations.
 *
 * Three layers of control on exits, evaluated in priority order:
 *   1. **Timeout** (72h) — bypasses band and backstop. Ghost-incident guard.
 *   2. **Absolute-rate backstop** — `recent_24h < entryCount24h · 0.5`
 *      closes the incident regardless of bands. Catches incidents whose
 *      seasonal baseline catches up with the sustained-but-declining rate
 *      ("the bands rose to meet the incident, not the other way around").
 *   3. **Band-shape + dwell** — both windows must drop below `expected +
 *      k_exit · σ` for `ESCALATION_EXIT_DWELL_MS` continuously. The dwell
 *      kills the flapping case where a single-bin dip would otherwise close
 *      an active incident.
 *
 * Cold-start: `isNew` (firstSeenAt within 7 days) returns `none` outright.
 * Below `MIN_SEASONAL_SAMPLES` of contributing prior weeks, `k` is inflated
 * by +1 (wider band where we have less evidence). At zero prior weeks the
 * detector falls back to the floor used pre-rewrite — same `ESCALATION_MIN_OCCURRENCES_THRESHOLD`
 * gate as before. The 7-day issue-age guard makes the zero-history case
 * rare in practice.
 */
export const evaluateSeasonalEscalation = (input: SeasonalEscalationDecisionInput): SeasonalEscalationDecision => {
  const { signals, kShort, isNew, wasEscalating, entrySignals, startedAt, exitEligibleSince, now } = input

  if (isNew) {
    // Never trip on issues younger than `NEW_ISSUE_AGE_DAYS` — the seasonal
    // bins barely have data to compare against, and the discrete `issue.new`
    // alert already covers the surfacing case.
    return { transition: "none", nextExitEligibleSince: null }
  }

  // wasEscalating === true: timeout always wins, before the snapshot or
  // band even gets a vote. Match Datadog/CloudWatch behaviour — a 72h
  // unchanged incident is almost certainly ghost state, not a real incident.
  if (wasEscalating && startedAt !== null && now.getTime() - startedAt.getTime() >= ESCALATION_MAX_DURATION_MS) {
    return { transition: "exit", reason: "timeout", nextExitEligibleSince: null }
  }

  // Deep cold start — no seasonal history at all. Fall back to the
  // pre-rewrite floor formula.
  if (signals.samplesCount === 0) {
    if (!wasEscalating) {
      const floor1h = ESCALATION_MIN_OCCURRENCES_THRESHOLD / 6
      if (signals.recent6h >= ESCALATION_MIN_OCCURRENCES_THRESHOLD && signals.recent1h >= floor1h) {
        // The snapshot has nothing useful to record (no expected/sigma to
        // freeze) — emit zeros so the column type stays satisfied; the
        // backstop will simply not fire for these incidents.
        return {
          transition: "enter",
          entrySignalsSnapshot: snapshotFromSignals(signals, kShort, Math.max(1, kShort - 1), 0, 0),
          nextExitEligibleSince: null,
        }
      }
      return { transition: "none", nextExitEligibleSince: null }
    }
    // Active incident with no seasonal context — absolute-rate backstop only.
    if (
      entrySignals !== null &&
      signals.recent24h < entrySignals.entryCount24h * ESCALATION_ABSOLUTE_RATE_EXIT_FACTOR
    ) {
      return { transition: "exit", reason: "absolute-rate-drop", nextExitEligibleSince: null }
    }
    return { transition: "none", nextExitEligibleSince: exitEligibleSince }
  }

  // Normal seasonal path. Inflate `k` when the seasonal sample is thin so
  // the band widens to account for noisy sigma estimates.
  const kAdj = signals.samplesCount < MIN_SEASONAL_SAMPLES ? kShort + 1 : kShort
  const kLong = Math.max(1, kAdj - 1)

  const sigma1h = sigmaEffective(signals.stddev1h, signals.expected1h)
  const sigma6hPerHour = sigmaEffective(signals.stddev6hPerHour, signals.expected6hPerHour)
  const recent6hPerHour = signals.recent6h / 6

  const entryBand1h = signals.expected1h + kAdj * sigma1h
  const entryBand6hPerHour = signals.expected6hPerHour + kLong * sigma6hPerHour
  const exitBand1h = signals.expected1h + ESCALATION_EXIT_THRESHOLD_FACTOR * kAdj * sigma1h
  const exitBand6hPerHour = signals.expected6hPerHour + ESCALATION_EXIT_THRESHOLD_FACTOR * kLong * sigma6hPerHour

  if (!wasEscalating) {
    // Multi-window AND: short window proves "now", long window proves "sustained".
    // Both must clear their bands so the short window doesn't trip on a single noisy minute.
    if (signals.recent1h > entryBand1h && recent6hPerHour > entryBand6hPerHour) {
      return {
        transition: "enter",
        entrySignalsSnapshot: snapshotFromSignals(signals, kShort, kLong, entryBand1h, entryBand6hPerHour),
        nextExitEligibleSince: null,
      }
    }
    return { transition: "none", nextExitEligibleSince: null }
  }

  // wasEscalating === true: try backstop before the band-shape exit. The
  // backstop catches the "rate has clearly dropped, bands don't matter"
  // case that the band-shape exit can miss when the seasonal baseline
  // climbs to meet a declining-but-still-elevated rate.
  if (entrySignals !== null && signals.recent24h < entrySignals.entryCount24h * ESCALATION_ABSOLUTE_RATE_EXIT_FACTOR) {
    return { transition: "exit", reason: "absolute-rate-drop", nextExitEligibleSince: null }
  }

  const exitShapeHolds = signals.recent1h < exitBand1h && recent6hPerHour < exitBand6hPerHour
  if (!exitShapeHolds) {
    return { transition: "none", nextExitEligibleSince: null }
  }

  // Exit shape holds — start or advance the dwell, but don't close yet.
  if (exitEligibleSince === null) {
    return { transition: "none", nextExitEligibleSince: now }
  }
  if (now.getTime() - exitEligibleSince.getTime() >= ESCALATION_EXIT_DWELL_MS) {
    return { transition: "exit", reason: "threshold", nextExitEligibleSince: null }
  }
  return { transition: "none", nextExitEligibleSince: exitEligibleSince }
}

export const deriveIssueLifecycleStates = ({
  issue,
  isEscalating,
  isRegressed,
  now = new Date(),
}: DeriveIssueLifecycleStatesInput): readonly IssueStateValue[] => {
  const states = new Set<IssueStateValue>()

  if (isIssueNew(issue.createdAt, now)) {
    states.add(IssueState.New)
  }

  // Escalating and regressed flags are sourced from `alert_incidents` rows
  // joined onto the issue read by `IssueRepository`. They're authoritative
  // — consumers don't recompute them from the occurrence aggregate.
  if (isEscalating) {
    states.add(IssueState.Escalating)
  }

  // Regressed only when the issue has actually-active regression history
  // AND the user hasn't re-resolved it. `resolvedAt` set wins: it means
  // the user has acknowledged the regression by resolving again.
  if (issue.resolvedAt === null && isRegressed) {
    states.add(IssueState.Regressed)
  }

  if (issue.resolvedAt !== null) {
    states.add(IssueState.Resolved)
  }

  if (issue.ignoredAt !== null) {
    states.add(IssueState.Ignored)
  }

  if (states.size === 0) {
    states.add(IssueState.Ongoing)
  }

  return ISSUE_STATES.filter((state): state is IssueStateValue => states.has(state))
}

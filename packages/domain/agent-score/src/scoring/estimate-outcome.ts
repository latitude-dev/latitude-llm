import type { OutcomeCoverageFloors } from "../entities/agent-score-artifact.ts"
import { type BinomialInterval, clopperPearsonInterval } from "./binomial-interval.ts"
import { estimateStratifiedRate, type StratifiedIntervalMethod } from "./stratified-rate.ts"

export const OUTCOME_EXCLUSION_REASONS = [
  "incompatibleJudgmentVersion",
  "unknownInclusionProbability",
  "deterministicEndpoint",
] as const

export type OutcomeExclusionReason = (typeof OUTCOME_EXCLUSION_REASONS)[number]

export type OutcomeIntervalMethod = StratifiedIntervalMethod

/** `coverageFloor` has no producer; stored snapshots still carry it. */
export type OutcomeUnmeasuredReason = "examinedFloor" | "coverageFloor"

export interface OutcomeSessionVerdict {
  readonly sessionId: string
  readonly succeeded: boolean
  /** Probability the session had of entering the judged sample, before its result was known. */
  readonly inclusionProbability: number
  readonly judgmentVersion: string
}

/** Degradation observed on the judged sessions analysis could read. */
export interface OutcomeDegradationInput {
  /**
   * Degrading moment kinds per session, for the sessions conversation analysis read.
   *
   * An absent session was not analyzed and stays out of `q_d`'s denominator entirely — analysis
   * selection is deterministic on content, so its rate cannot be projected onto the sessions it
   * skipped. Present with an empty list means analysis read the session and found nothing.
   */
  readonly degradedKindsBySession: ReadonlyMap<string, readonly string[]>
  readonly degradedWeight: number
  readonly minAnalyzedSessions: number
}

export interface OutcomeDegradationEstimate {
  readonly applied: boolean
  readonly analyzedSessionCount: number
  readonly degradedSessionCount: number
  /** Degraded share among analyzed, non-failed judged sessions. Zero when the component is off. */
  readonly degradedShare: number
  /** Retained so a composite replicate can redraw the factor instead of holding it fixed. */
  readonly degradedWeight: number
}

export interface EstimateProjectOutcomeInput {
  readonly eligibleSessionCount: number
  /**
   * Sessions a deterministic reader proved could not have succeeded. They are a
   * census, not a sample, and they leave the judged stratum entirely so the
   * sample stays a random draw of the sessions it represents.
   */
  readonly deterministicFailureSessionIds: readonly string[]
  readonly judgedSessions: readonly OutcomeSessionVerdict[]
  readonly supportedJudgmentVersions: readonly string[]
  readonly floors: OutcomeCoverageFloors
  readonly confidenceLevel?: number
  readonly degradation?: OutcomeDegradationInput
}

export interface ProjectOutcomeEstimate {
  /** 0 through 100. Absent when unmeasured: no midpoint, no zero, no hundred. */
  readonly outcome?: number
  readonly interval?: BinomialInterval
  readonly intervalMethod?: OutcomeIntervalMethod
  readonly eligibleSessionCount: number
  readonly examinedSessionCount: number
  readonly deterministicSessionCount: number
  readonly sampledSessionCount: number
  /** Judged sessions the judge called a failure. Coverage context, and the composite's endpoint count. */
  readonly sampledFailureCount: number
  /**
   * Selection-corrected weight behind each stratum.
   *
   * The census is certain, so it weighs one per session; the sample stands for the traffic it was
   * drawn from. Both are reported because the pooled rate is a ratio between them, and a composite
   * replicate has to redraw the sampled side while the census stays fixed.
   */
  readonly sampledWeight: number
  readonly censusWeight: number
  readonly excluded: Readonly<Record<OutcomeExclusionReason, number>>
  readonly coverage: "measured" | "unmeasured"
  readonly unmeasuredReason?: OutcomeUnmeasuredReason
  /**
   * The sessions that entered the rate, with what the judge said and the draw that selected them.
   *
   * Returned rather than discarded because the issue rows explain this exact population: a row that
   * ranked failures the estimator excluded would be describing a different denominator than the
   * score above it.
   */
  readonly judgedSessions: readonly OutcomeSessionVerdict[]
  /** Sessions a deterministic reader proved failed. Certain, so they carry no selection draw. */
  readonly deterministicFailureSessionIds: readonly string[]
  /** What the degradation factor contributed, and whether it applied at all. */
  readonly degradation: OutcomeDegradationEstimate
}

const NO_DEGRADATION: OutcomeDegradationEstimate = {
  applied: false,
  analyzedSessionCount: 0,
  degradedSessionCount: 0,
  degradedShare: 0,
  degradedWeight: 1,
}

/**
 * The degradation factor and its interval, as a share of outcome value retained.
 *
 * Returns the identity factor when the component does not apply, so an unmeasured degradation is
 * exactly today's score rather than a withheld dimension. A Clopper-Pearson interval on zero trials
 * is `[0, 1]`, which would widen Outcome until the confidence gate withheld it — and because the
 * publication gate is all-or-nothing, that would blank the whole Agent Score over a
 * conversation-analysis gap. So the gate zeroes the component rather than estimating it.
 */
const degradationFactor = (
  input: OutcomeDegradationInput | undefined,
  /** The sessions the rate was taken over, so degradation describes that same population. */
  succeeded: readonly OutcomeSessionVerdict[],
  confidenceLevel: number | undefined,
): {
  readonly estimate: OutcomeDegradationEstimate
  readonly point: number
  readonly lower: number
  readonly upper: number
} => {
  const identity = { estimate: NO_DEGRADATION, point: 1, lower: 1, upper: 1 }
  if (!input) return identity

  // Only sessions the judge did not fail can be degraded: a failed session is already worth zero,
  // and degrading it again would count one shortfall twice.
  const analyzed = succeeded.filter((verdict) => input.degradedKindsBySession.has(verdict.sessionId))
  const analyzedSessionCount = analyzed.length
  const degradedSessionCount = analyzed.filter(
    (verdict) => (input.degradedKindsBySession.get(verdict.sessionId) ?? []).length > 0,
  ).length

  if (analyzedSessionCount < input.minAnalyzedSessions || analyzedSessionCount <= 0) {
    return {
      ...identity,
      estimate: { ...NO_DEGRADATION, analyzedSessionCount, degradedSessionCount },
    }
  }

  const share = degradedSessionCount / analyzedSessionCount
  const loss = 1 - input.degradedWeight
  const interval = clopperPearsonInterval({
    successes: degradedSessionCount,
    trials: analyzedSessionCount,
    ...(confidenceLevel !== undefined ? { confidenceLevel } : {}),
  })

  return {
    estimate: {
      applied: true,
      analyzedSessionCount,
      degradedSessionCount,
      degradedShare: share,
      degradedWeight: input.degradedWeight,
    },
    point: 1 - loss * share,
    // A higher degraded share retains less value, so the bounds swap.
    lower: 1 - loss * interval.upper,
    upper: 1 - loss * interval.lower,
  }
}

const emptyExclusions = (): Record<OutcomeExclusionReason, number> => ({
  incompatibleJudgmentVersion: 0,
  unknownInclusionProbability: 0,
  deterministicEndpoint: 0,
})

/**
 * The selection-corrected share of judgeable sessions that accomplished what
 * the user asked.
 *
 * Two strata, because they are known with different certainty. The
 * deterministic stratum is a census of sessions that demonstrably failed, so it
 * carries weight one and contributes no successes. The judged stratum is a
 * sample, so each session stands for `1 / inclusionProbability` of them. The
 * pooled rate is a monotone function of the sampled success rate, which is what
 * lets an exact binomial interval on the sample transform into an interval on
 * the score. Lower and upper bounds are never summed across strata.
 */
export const estimateProjectOutcome = (input: EstimateProjectOutcomeInput): ProjectOutcomeEstimate => {
  const floors = input.floors
  const supported = new Set(input.supportedJudgmentVersions)
  const deterministic = new Set(input.deterministicFailureSessionIds)
  const excluded = emptyExclusions()

  const eligible: OutcomeSessionVerdict[] = []
  for (const verdict of input.judgedSessions) {
    if (deterministic.has(verdict.sessionId)) {
      excluded.deterministicEndpoint += 1
      continue
    }
    if (!supported.has(verdict.judgmentVersion)) {
      excluded.incompatibleJudgmentVersion += 1
      continue
    }
    if (!Number.isFinite(verdict.inclusionProbability) || verdict.inclusionProbability <= 0) {
      excluded.unknownInclusionProbability += 1
      continue
    }
    eligible.push(verdict)
  }

  const factor = degradationFactor(
    input.degradation,
    eligible.filter((verdict) => verdict.succeeded),
    input.confidenceLevel,
  )

  const base = {
    eligibleSessionCount: input.eligibleSessionCount,
    examinedSessionCount: deterministic.size + eligible.length,
    deterministicSessionCount: deterministic.size,
    sampledSessionCount: eligible.length,
    sampledFailureCount: eligible.filter((verdict) => !verdict.succeeded).length,
    sampledWeight: eligible.reduce((total, verdict) => total + 1 / verdict.inclusionProbability, 0),
    censusWeight: deterministic.size,
    excluded,
    judgedSessions: eligible,
    deterministicFailureSessionIds: [...deterministic],
    degradation: factor.estimate,
  }

  if (eligible.length < floors.examinedSessions) {
    return { ...base, coverage: "unmeasured", unmeasuredReason: "examinedFloor" }
  }

  // The deterministic stratum is a census of sessions that demonstrably failed,
  // so it carries weight one each and contributes no successes.
  const estimate = estimateStratifiedRate({
    observations: eligible.map((verdict) => ({
      inclusionProbability: verdict.inclusionProbability,
      event: verdict.succeeded,
    })),
    censusWeight: deterministic.size,
    censusEvents: 0,
    ...(input.confidenceLevel !== undefined ? { confidenceLevel: input.confidenceLevel } : {}),
  })

  // Outcome is the product of two rates: the share of sessions that accomplished the task, and the
  // share of outcome value the accomplished ones retained. Both are binomial, so the product's
  // bounds come from combining theirs. Conservative — it assumes both reach their bound at once —
  // in the same way `estimateStratifiedRate` pools across sub-strata.
  return {
    ...base,
    outcome: 100 * estimate.rate * factor.point,
    interval: {
      lower: 100 * estimate.interval.lower * factor.lower,
      upper: 100 * estimate.interval.upper * factor.upper,
    },
    intervalMethod: estimate.method,
    coverage: "measured",
  }
}

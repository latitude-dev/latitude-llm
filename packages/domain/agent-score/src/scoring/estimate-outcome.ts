import type { OutcomeCoverageFloors } from "../entities/agent-score-artifact.ts"
import type { BinomialInterval } from "./binomial-interval.ts"
import { estimateStratifiedRate, type StratifiedIntervalMethod } from "./stratified-rate.ts"

export const OUTCOME_EXCLUSION_REASONS = [
  "incompatibleJudgmentVersion",
  "unknownInclusionProbability",
  "deterministicEndpoint",
] as const

export type OutcomeExclusionReason = (typeof OUTCOME_EXCLUSION_REASONS)[number]

export type OutcomeIntervalMethod = StratifiedIntervalMethod

export type OutcomeUnmeasuredReason = "examinedFloor" | "coverageFloor"

export interface OutcomeSessionVerdict {
  readonly sessionId: string
  readonly succeeded: boolean
  /** Probability the session had of entering the judged sample, before its result was known. */
  readonly inclusionProbability: number
  readonly judgmentVersion: string
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
  }

  const examinedShare = input.eligibleSessionCount > 0 ? base.examinedSessionCount / input.eligibleSessionCount : 0

  if (eligible.length < floors.examinedSessions) {
    return { ...base, coverage: "unmeasured", unmeasuredReason: "examinedFloor" }
  }
  if (examinedShare < floors.examinedShareOfEligible) {
    return { ...base, coverage: "unmeasured", unmeasuredReason: "coverageFloor" }
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

  const scale = (bound: number) => 100 * bound

  return {
    ...base,
    outcome: 100 * estimate.rate,
    interval: { lower: scale(estimate.interval.lower), upper: scale(estimate.interval.upper) },
    intervalMethod: estimate.method,
    coverage: "measured",
  }
}

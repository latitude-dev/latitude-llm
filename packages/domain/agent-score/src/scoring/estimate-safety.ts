import type { FlaggerScreeningOutcome, FlaggerScreeningSelectionReason } from "@domain/flaggers"
import type { BinomialInterval } from "./binomial-interval.ts"
import { estimateStratifiedRate, type StratifiedIntervalMethod } from "./stratified-rate.ts"

/** The horizon Safety expresses cumulative risk over, from the fixed score settings. */
export const SAFETY_REFERENCE_RUN_SESSIONS = 1000

/**
 * Safety's coverage floors.
 *
 * Provisional, and larger than Outcome's for a reason the formula forces: the
 * reference-run transform is degenerate on a small examined population. With a
 * few hundred examined sessions, zero harms reads 100 and one harm reads
 * approximately zero, with nothing in between, and the zero-harm lower bound is
 * `100 * 0.05 ^ (referenceRun / examined)`, which is still near zero at a
 * hundred. Safety gates on the size of that population rather than on the width
 * of the interval, which page.md already presents as wide by nature.
 */
export interface SafetyCoverageFloors {
  readonly examinedSessions: number
  readonly examinedShareOfEligible: number
  /**
   * How much of the hinted stratum may be lost to rate limiting before the
   * missingness stops being ignorable. Hinted Safety sessions are the ones most
   * likely to contain harm, so dropping them biases the rate downward.
   */
  readonly maxRateLimitedHintedShare: number
}

export const PROVISIONAL_SAFETY_COVERAGE_FLOORS: SafetyCoverageFloors = {
  examinedSessions: 1_000,
  examinedShareOfEligible: 0.05,
  maxRateLimitedHintedShare: 0.1,
}

export const SAFETY_EXCLUSION_REASONS = [
  "incompleteSuite",
  "suiteNotApplicable",
  "unknownInclusionProbability",
  "incompatibleJudgmentVersion",
] as const

export type SafetyExclusionReason = (typeof SAFETY_EXCLUSION_REASONS)[number]

export type SafetyUnmeasuredReason = "examinedFloor" | "coverageFloor" | "rateLimitedHintedFloor"

export interface SafetyMemberDecision {
  readonly flaggerSlug: string
  readonly analysisHash: string
  readonly selected: boolean
  readonly reason: FlaggerScreeningSelectionReason
  readonly inclusionProbability?: number
  readonly outcome?: FlaggerScreeningOutcome
  readonly hintKinds: readonly string[]
}

export interface SafetySessionExamination {
  readonly sessionId: string
  /** The newest screening decision each suite member reached for this session. */
  readonly decisions: readonly SafetyMemberDecision[]
  /** Judge versions behind this session's confirmed-harm findings; empty when the suite found none. */
  readonly harmJudgmentVersions: readonly string[]
}

export interface EstimateProjectSafetyInput {
  readonly eligibleSessionCount: number
  readonly sessions: readonly SafetySessionExamination[]
  readonly suiteSlugs: readonly string[]
  readonly supportedJudgmentVersions: readonly string[]
  readonly floors?: SafetyCoverageFloors
  readonly confidenceLevel?: number
  readonly referenceRunSessions?: number
}

export interface ProjectSafetyEstimate {
  /** 0 through 100. Absent when unmeasured: no midpoint, no zero, no hundred. */
  readonly safety?: number
  readonly interval?: BinomialInterval
  readonly intervalMethod?: StratifiedIntervalMethod
  /** The selection-corrected share of examined sessions carrying confirmed harm. */
  readonly harmRate?: number
  readonly eligibleSessionCount: number
  readonly examinedSessionCount: number
  readonly harmedSessionCount: number
  readonly excluded: Readonly<Record<SafetyExclusionReason, number>>
  /** Hinted sessions the limiter dropped, which is informative missingness rather than a sample. */
  readonly rateLimitedHintedCount: number
  readonly coverage: "measured" | "unmeasured"
  readonly unmeasuredReason?: SafetyUnmeasuredReason
}

const emptyExclusions = (): Record<SafetyExclusionReason, number> => ({
  incompleteSuite: 0,
  suiteNotApplicable: 0,
  unknownInclusionProbability: 0,
  incompatibleJudgmentVersion: 0,
})

/** Outcomes that mean the detector ran to a judgement, whatever it concluded. */
const isCompletedOutcome = (outcome: FlaggerScreeningOutcome | undefined): boolean =>
  outcome === "matched" || outcome === "unmatched" || outcome === "success" || outcome === "failure"

const isRateLimitedHinted = (decision: SafetyMemberDecision): boolean =>
  decision.reason === "rate-limited" && decision.hintKinds.length > 0

interface SuiteExamination {
  readonly status: "examined" | "incomplete" | "notApplicable"
  readonly inclusionProbability?: number
  readonly hinted: boolean
}

/**
 * Whether the whole launch suite ran on this session, in one generation.
 *
 * A member that could not read the session is not applicable rather than
 * missing, so the suite still completes on the member that could. Everything
 * else has to have been selected and reached a judgement in the same analysis
 * generation: a pending, failed, or superseded member leaves the session
 * unexamined rather than partly examined.
 */
const examineSuite = (session: SafetySessionExamination, suiteSlugs: readonly string[]): SuiteExamination => {
  const bySlug = new Map(session.decisions.map((decision) => [decision.flaggerSlug, decision]))
  const completed: SafetyMemberDecision[] = []

  for (const slug of suiteSlugs) {
    const decision = bySlug.get(slug)
    if (!decision) return { status: "incomplete", hinted: false }
    if (decision.outcome === "notApplicable") continue
    if (!decision.selected || !isCompletedOutcome(decision.outcome)) return { status: "incomplete", hinted: false }
    completed.push(decision)
  }

  if (completed.length === 0) return { status: "notApplicable", hinted: false }

  const hinted = completed.some((decision) => decision.reason === "hinted")
  const generations = new Set(completed.map((decision) => decision.analysisHash))
  if (generations.size > 1) return { status: "incomplete", hinted }

  const probabilities = new Set(completed.map((decision) => decision.inclusionProbability))
  const inclusionProbability = probabilities.size === 1 ? [...probabilities][0] : undefined
  return {
    status: "examined",
    hinted,
    ...(inclusionProbability !== undefined ? { inclusionProbability } : {}),
  }
}

/**
 * The probability that a reference run contains no confirmed agent-caused harm.
 *
 * `q` is the selection-corrected share of examined sessions the agent harmed
 * somebody in, unioned once per session however many detectors saw it, and
 * Safety is `(1 - q)` compounded over the reference run. The transform is
 * monotone decreasing, so the upper bound on the harm rate produces the lower
 * bound on the score.
 */
export const estimateProjectSafety = (input: EstimateProjectSafetyInput): ProjectSafetyEstimate => {
  const floors = input.floors ?? PROVISIONAL_SAFETY_COVERAGE_FLOORS
  const supported = new Set(input.supportedJudgmentVersions)
  const excluded = emptyExclusions()

  const observations: { inclusionProbability: number; event: boolean }[] = []
  let harmedSessionCount = 0
  let rateLimitedHintedCount = 0
  let hintedExaminedCount = 0

  for (const session of input.sessions) {
    if (session.decisions.some(isRateLimitedHinted)) rateLimitedHintedCount += 1

    const suite = examineSuite(session, input.suiteSlugs)
    if (suite.status === "notApplicable") {
      excluded.suiteNotApplicable += 1
      continue
    }
    if (suite.status === "incomplete") {
      excluded.incompleteSuite += 1
      continue
    }
    // Harm judged by an unsupported judge is evidence this window cannot pool,
    // and the session's harm status is unknown without it.
    if (session.harmJudgmentVersions.some((version) => !supported.has(version))) {
      excluded.incompatibleJudgmentVersion += 1
      continue
    }
    const probability = suite.inclusionProbability
    if (probability === undefined || !Number.isFinite(probability) || probability <= 0) {
      excluded.unknownInclusionProbability += 1
      continue
    }

    if (suite.hinted) hintedExaminedCount += 1
    const harmed = session.harmJudgmentVersions.length > 0
    if (harmed) harmedSessionCount += 1
    observations.push({ inclusionProbability: probability, event: harmed })
  }

  const base = {
    eligibleSessionCount: input.eligibleSessionCount,
    examinedSessionCount: observations.length,
    harmedSessionCount,
    excluded,
    rateLimitedHintedCount,
  }

  const examinedShare = input.eligibleSessionCount > 0 ? observations.length / input.eligibleSessionCount : 0
  const hintedStratum = hintedExaminedCount + rateLimitedHintedCount
  const rateLimitedHintedShare = hintedStratum > 0 ? rateLimitedHintedCount / hintedStratum : 0

  if (observations.length < floors.examinedSessions) {
    return { ...base, coverage: "unmeasured", unmeasuredReason: "examinedFloor" }
  }
  if (examinedShare < floors.examinedShareOfEligible) {
    return { ...base, coverage: "unmeasured", unmeasuredReason: "coverageFloor" }
  }
  if (rateLimitedHintedShare > floors.maxRateLimitedHintedShare) {
    return { ...base, coverage: "unmeasured", unmeasuredReason: "rateLimitedHintedFloor" }
  }

  const estimate = estimateStratifiedRate({
    observations,
    ...(input.confidenceLevel !== undefined ? { confidenceLevel: input.confidenceLevel } : {}),
  })
  const referenceRun = input.referenceRunSessions ?? SAFETY_REFERENCE_RUN_SESSIONS
  const survival = (harmRate: number) => 100 * (1 - Math.min(1, Math.max(0, harmRate))) ** referenceRun

  return {
    ...base,
    safety: survival(estimate.rate),
    harmRate: estimate.rate,
    interval: { lower: survival(estimate.interval.upper), upper: survival(estimate.interval.lower) },
    intervalMethod: estimate.method,
    coverage: "measured",
  }
}

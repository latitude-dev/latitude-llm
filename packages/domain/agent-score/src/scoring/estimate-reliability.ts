import type { ReliabilityCoverageFloors } from "../entities/agent-score-artifact.ts"
import type { BinomialInterval } from "./binomial-interval.ts"
import { survivalInterval, survivalOverReferenceRun } from "./reference-run.ts"
import type { ReliabilityExclusionReason, ReliabilitySessionEndpoint } from "./select-reliability-endpoints.ts"
import { estimateStratifiedRate, type StratifiedIntervalMethod } from "./stratified-rate.ts"

export type ReliabilityUnmeasuredReason = "readableFloor" | "coverageFloor"

export interface EstimateProjectReliabilityInput {
  readonly eligibleSessionCount: number
  readonly sessions: readonly ReliabilitySessionEndpoint[]
  readonly floors: ReliabilityCoverageFloors
  readonly referenceRunSessions: number
  readonly confidenceLevel?: number
}

export interface ProjectReliabilityEstimate {
  /** 0 through 100. Absent when unmeasured: no midpoint, no zero, no hundred. */
  readonly reliability?: number
  readonly interval?: BinomialInterval
  readonly intervalMethod?: StratifiedIntervalMethod
  /**
   * The one-session operational success rate, 0 through 1.
   *
   * Always returned with the score because `page.md` requires the card, the section, the tooltip
   * and the public representation to show it: 95% of sessions completing and a 36% chance of twenty
   * consecutive ones are the same fact, and the second is unreadable without the first.
   */
  readonly successRate?: number
  readonly eligibleSessionCount: number
  readonly readableSessionCount: number
  readonly terminalFailureSessionCount: number
  readonly excluded: Readonly<Record<ReliabilityExclusionReason, number>>
  readonly coverage: "measured" | "unmeasured"
  readonly unmeasuredReason?: ReliabilityUnmeasuredReason
}

const emptyExclusions = (): Record<ReliabilityExclusionReason, number> => ({
  unreadableTelemetry: 0,
  noApplicableReader: 0,
})

/**
 * The probability that a reference run of sessions completes without a terminal operational
 * failure.
 *
 * A census rather than a sample: every eligible session either was or was not operationally
 * successful, and no detector had to be selected to find out, so each carries weight one and the
 * interval is the exact binomial. That is the only structural difference from Safety, which
 * measures a sampled population with the same arithmetic over a longer horizon.
 *
 * Recovered incidents are absent by construction. An agent that hit a provider error, retried, and
 * finished did complete, and `score.md` is explicit that this costs it nothing here: the retry is
 * recovery-family Cost evidence and marginal Speed time instead. Reliability answers whether the
 * next twenty sessions can all finish, not how smoothly they will.
 */
export const estimateProjectReliability = (input: EstimateProjectReliabilityInput): ProjectReliabilityEstimate => {
  const excluded = emptyExclusions()
  const observations: { inclusionProbability: number; event: boolean }[] = []
  let terminalFailureSessionCount = 0

  for (const session of input.sessions) {
    if (!session.readable) {
      excluded[session.unreadableReason ?? "unreadableTelemetry"] += 1
      continue
    }
    if (session.terminalFailure) terminalFailureSessionCount += 1
    observations.push({ inclusionProbability: 1, event: session.terminalFailure })
  }

  const base = {
    eligibleSessionCount: input.eligibleSessionCount,
    readableSessionCount: observations.length,
    terminalFailureSessionCount,
    excluded,
  }

  const readableShare = input.eligibleSessionCount > 0 ? observations.length / input.eligibleSessionCount : 0
  // A zero floor would otherwise publish 100 from an empty window, because a rate over no
  // observations is zero by definition rather than by evidence.
  if (observations.length < Math.max(1, input.floors.readableSessions)) {
    return { ...base, coverage: "unmeasured", unmeasuredReason: "readableFloor" }
  }
  if (readableShare < input.floors.readableShareOfEligible) {
    return { ...base, coverage: "unmeasured", unmeasuredReason: "coverageFloor" }
  }

  const failure = estimateStratifiedRate({
    observations,
    ...(input.confidenceLevel !== undefined ? { confidenceLevel: input.confidenceLevel } : {}),
  })
  const referenceRunSessions = input.referenceRunSessions

  return {
    ...base,
    reliability: survivalOverReferenceRun({ adverseRate: failure.rate, referenceRunSessions }),
    successRate: 1 - failure.rate,
    interval: survivalInterval({ interval: failure.interval, referenceRunSessions }),
    intervalMethod: failure.method,
    coverage: "measured",
  }
}

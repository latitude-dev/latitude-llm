import { describe, expect, it } from "vitest"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "../artifacts/launch-agent-score-artifact.ts"
import { LAUNCH_COST_SCORING_ARTIFACT } from "../artifacts/launch-cost-scoring-artifact.ts"
import { aggregateWindowCost, aggregateWindowSpeed, type SessionWindowContribution } from "./bootstrap-window.ts"
import { buildWindowSignalEffects, type SessionSignalEvidence } from "./build-window-signal-effects.ts"
import { estimateProjectReliability } from "./estimate-reliability.ts"
import type { ReliabilitySessionEndpoint } from "./select-reliability-endpoints.ts"

/**
 * The statements `signals.md` makes about what must not move a score.
 *
 * These are the window-level versions. Their session-level equivalents — one family charged once
 * when two metrics blame the same calls, one session counted once per issue however many detectors
 * saw it — are already pinned elsewhere; these say the same thing about the number a project is
 * finally shown, which is where a reader would notice it being wrong.
 */

const contribution = (index: number, penalized: number): SessionWindowContribution => ({
  sessionId: `session-${index}`,
  families: [{ family: "tools", eligibleUnits: 20, penalizedUnits: penalized }],
  speed: { observedNs: 1_000_000, avoidableNs: penalized * 10_000, usableForDenominator: true },
})

const window = (count: number): SessionWindowContribution[] =>
  Array.from({ length: count }, (_, index) => contribution(index, index % 5))

const costOf = (contributions: readonly SessionWindowContribution[], residualSignalPenalty = 0) =>
  aggregateWindowCost({ contributions, artifact: LAUNCH_COST_SCORING_ARTIFACT, residualSignalPenalty }).cost

describe("duplicated traffic", () => {
  it("leaves Cost unchanged when every session is duplicated", () => {
    const once = window(200)
    const twice = [...once, ...once.map((entry, index) => ({ ...entry, sessionId: `copy-${index}` }))]

    expect(costOf(twice)).toBeCloseTo(costOf(once), 9)
  })

  it("leaves Speed unchanged when every session is duplicated", () => {
    const once = window(200)
    const twice = [...once, ...once.map((entry, index) => ({ ...entry, sessionId: `copy-${index}` }))]

    expect(aggregateWindowSpeed(twice).speed).toBeCloseTo(aggregateWindowSpeed(once).speed, 9)
  })

  it("leaves Reliability unchanged when every session is duplicated", () => {
    const endpoint = (index: number, failed: boolean): ReliabilitySessionEndpoint => ({
      sessionId: `s-${index}`,
      terminalFailure: failed,
      readable: true,
      causes: failed ? ["providerError"] : [],
    })
    const once = Array.from({ length: 400 }, (_, index) => endpoint(index, index % 20 === 0))
    const twice = [...once, ...once.map((entry, index) => ({ ...entry, sessionId: `copy-${index}` }))]

    const estimate = (sessions: readonly ReliabilitySessionEndpoint[], eligible: number) =>
      estimateProjectReliability({
        eligibleSessionCount: eligible,
        sessions,
        floors: { readableSessions: 1, readableShareOfEligible: 0 },
        referenceRunSessions: LAUNCH_AGENT_SCORE_ARTIFACT.referenceRuns.reliability,
      })

    expect(estimate(twice, 800).reliability).toBeCloseTo(estimate(once, 400).reliability as number, 9)
  })
})

const signalSession = ({
  index,
  signals,
  penalty,
}: {
  readonly index: number
  readonly signals: readonly string[]
  readonly penalty: number
}): SessionSignalEvidence => ({
  sessionId: `s-${index}`,
  stratum: "one-workload",
  fold: (index % 2) as 0 | 1,
  familyPenaltyShare: { spend: 0, context: 0, tools: penalty, memory: 0, recovery: 0 },
  avoidableNs: 0,
  unlinkedSignalIds: signals,
  inclusionProbabilityBySignalId: new Map(signals.map((signalId) => [signalId, 1])),
  linkedSignalIds: [],
})

/** Exposed sessions carry a small excess, so the residual cap never masks a doubling. */
const signalWindow = (signalsOnExposed: readonly string[]): SessionSignalEvidence[] => [
  ...Array.from({ length: 30 }, (_, index) => signalSession({ index, signals: signalsOnExposed, penalty: 0.12 })),
  ...Array.from({ length: 30 }, (_, index) => signalSession({ index: 100 + index, signals: [], penalty: 0.1 })),
]

const residualOf = (evidence: readonly SessionSignalEvidence[]) =>
  buildWindowSignalEffects({ evidence, artifact: LAUNCH_COST_SCORING_ARTIFACT }).costPenalty

describe("split signal clusters", () => {
  it("measures an effect at all, so the invariance below is not vacuous", () => {
    expect(residualOf(signalWindow(["cluster"]))).toBeGreaterThan(0)
  })

  it("does not multiply an effect when one cluster is split into equivalent children", () => {
    const whole = residualOf(signalWindow(["cluster"]))
    const split = residualOf(signalWindow(["child-a", "child-b"]))

    expect(split).toBeCloseTo(whole, 9)
  })

  it("does not multiply it when the split goes further", () => {
    const whole = residualOf(signalWindow(["cluster"]))
    const shattered = residualOf(signalWindow(["a", "b", "c", "d", "e"]))

    expect(shattered).toBeCloseTo(whole, 9)
  })

  it("still fits two signals on genuinely different sessions as separate groups", () => {
    // Disjoint exposure is not duplication. Grouping them would hide one behind the other, which is
    // the error that matters in this direction, so the assertion is on the grouping and not on the
    // total: two disjoint signals can happen to sum to the same number a single cluster produces.
    const disjoint: SessionSignalEvidence[] = [
      ...Array.from({ length: 30 }, (_, index) => signalSession({ index, signals: ["alpha"], penalty: 0.12 })),
      ...Array.from({ length: 30 }, (_, index) =>
        signalSession({ index: 50 + index, signals: ["beta"], penalty: 0.12 }),
      ),
      ...Array.from({ length: 30 }, (_, index) => signalSession({ index: 100 + index, signals: [], penalty: 0.1 })),
    ]

    const groupsOf = (evidence: readonly SessionSignalEvidence[]) =>
      new Set(
        buildWindowSignalEffects({ evidence, artifact: LAUNCH_COST_SCORING_ARTIFACT }).costResiduals.map(
          (residual) => residual.groupId,
        ),
      )

    expect(groupsOf(disjoint).size).toBe(2)
    expect(groupsOf(signalWindow(["child-a", "child-b"])).size).toBe(1)
  })
})

describe("duplicate detectors", () => {
  it("leaves Cost unchanged when a second detector reports the same sessions", () => {
    const single = signalWindow(["detector"])
    const duplicated = signalWindow(["detector", "detector-copy"])

    expect(costOf(window(200), residualOf(duplicated))).toBeCloseTo(costOf(window(200), residualOf(single)), 9)
  })

  it("keeps a measured family penalty when correlated signals merge into one", () => {
    // Merging changes only the residual channel; the deterministic evidence is untouched.
    const merged = residualOf(signalWindow(["merged"]))
    const separate = residualOf(signalWindow(["one", "two"]))

    expect(costOf(window(200), merged)).toBeCloseTo(costOf(window(200), separate), 9)
    expect(costOf(window(200), merged)).toBeLessThan(costOf(window(200)))
  })
})

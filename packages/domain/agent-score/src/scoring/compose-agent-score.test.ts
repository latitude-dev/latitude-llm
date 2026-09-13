import { SCORE_DIMENSIONS } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "../artifacts/launch-agent-score-artifact.ts"
import { LAUNCH_COST_SCORING_ARTIFACT } from "../artifacts/launch-cost-scoring-artifact.ts"
import type { AgentScoreArtifact } from "../entities/agent-score-artifact.ts"
import type { SessionWindowContribution } from "./bootstrap-window.ts"
import { type ComposeAgentScoreInput, composeAgentScore } from "./compose-agent-score.ts"
import type { ProjectOutcomeEstimate } from "./estimate-outcome.ts"
import type { ProjectReliabilityEstimate } from "./estimate-reliability.ts"
import type { ProjectSafetyEstimate } from "./estimate-safety.ts"
import type { CostWindowGate, SpeedWindowGate } from "./window-gates.ts"

const outcome = (overrides: Partial<ProjectOutcomeEstimate> = {}): ProjectOutcomeEstimate => {
  const estimate = {
    outcome: 80,
    interval: { lower: 75, upper: 85 },
    intervalMethod: "exactBinomial" as const,
    eligibleSessionCount: 1_000,
    examinedSessionCount: 200,
    deterministicSessionCount: 0,
    sampledSessionCount: 200,
    sampledFailureCount: 40,
    sampledWeight: 2_000,
    censusWeight: 0,
    excluded: { incompatibleJudgmentVersion: 0, unknownInclusionProbability: 0, deterministicEndpoint: 0 },
    coverage: "measured" as const,
    ...overrides,
  }
  const inclusionProbability =
    estimate.sampledWeight > 0 ? Math.min(1, estimate.sampledSessionCount / estimate.sampledWeight) : 1
  return {
    ...estimate,
    judgedSessions:
      overrides.judgedSessions ??
      Array.from({ length: estimate.sampledSessionCount }, (_, index) => ({
        sessionId: `outcome-${index}`,
        succeeded: index >= estimate.sampledFailureCount,
        inclusionProbability,
        judgmentVersion: "test",
      })),
    deterministicFailureSessionIds:
      overrides.deterministicFailureSessionIds ??
      Array.from({ length: estimate.deterministicSessionCount }, (_, index) => `deterministic-${index}`),
  }
}

const reliability = (overrides: Partial<ProjectReliabilityEstimate> = {}): ProjectReliabilityEstimate => ({
  reliability: 36,
  successRate: 0.95,
  interval: { lower: 29, upper: 43 },
  intervalMethod: "exactBinomial",
  eligibleSessionCount: 1_000,
  readableSessionCount: 1_000,
  terminalFailureSessionCount: 50,
  excluded: { unreadableTelemetry: 0, noApplicableReader: 0 },
  coverage: "measured",
  ...overrides,
})

const safety = (overrides: Partial<ProjectSafetyEstimate> = {}): ProjectSafetyEstimate => {
  const estimate = {
    safety: 90,
    harmRate: 0.001,
    interval: { lower: 56, upper: 99 },
    intervalMethod: "exactBinomial" as const,
    eligibleSessionCount: 1_000,
    examinedSessionCount: 1_000,
    harmedSessionCount: 1,
    excluded: {
      incompleteSuite: 0,
      suiteNotApplicable: 0,
      unknownInclusionProbability: 0,
      incompatibleJudgmentVersion: 0,
    },
    rateLimitedHintedCount: 0,
    coverage: "measured" as const,
    ...overrides,
  }
  return {
    ...estimate,
    examinedSessions:
      overrides.examinedSessions ??
      Array.from({ length: estimate.examinedSessionCount }, (_, index) => ({
        sessionId: `safety-${index}`,
        harmed: index < estimate.harmedSessionCount,
        examinationProbability: 1,
      })),
  }
}

const costGate = (overrides: Partial<CostWindowGate> = {}): CostWindowGate => ({
  coverage: "measured",
  families: [],
  publishableSessionCount: 1_000,
  withheldSessionCount: 0,
  publishableSessionShare: 1,
  ...overrides,
})

const speedGate = (overrides: Partial<SpeedWindowGate> = {}): SpeedWindowGate => ({
  coverage: "measured",
  completeSessionCount: 1_000,
  incompleteSessionCount: 0,
  completeShareOfEligible: 1,
  ...overrides,
})

const contributions = (count: number): SessionWindowContribution[] =>
  Array.from({ length: count }, (_, index) => ({
    sessionId: `session-${index}`,
    costUsableForDenominator: true,
    families: [{ family: "tools" as const, eligibleUnits: 10, penalizedUnits: index % 5 === 0 ? 4 : 1 }],
    speed: { observedNs: 1_000_000, avoidableNs: index % 4 === 0 ? 300_000 : 50_000, usableForDenominator: true },
  }))

const compose = (overrides: Partial<ComposeAgentScoreInput> = {}) =>
  composeAgentScore({
    artifact: LAUNCH_AGENT_SCORE_ARTIFACT,
    costArtifact: LAUNCH_COST_SCORING_ARTIFACT,
    outcome: outcome(),
    reliability: reliability(),
    safety: safety(),
    cost: { gate: costGate() },
    speed: { gate: speedGate() },
    contributions: contributions(40),
    replicates: 60,
    seed: 7,
    ...overrides,
  })

describe("composeAgentScore", () => {
  it("weights the five dimensions exactly as score.md fixes them", () => {
    const result = compose()
    const scoreOf = (dimension: string) =>
      result.dimensions.find((entry) => entry.scoreDimension === dimension)?.score as number

    expect(result.composite?.score).toBeCloseTo(
      scoreOf("outcome") * 0.35 +
        scoreOf("reliability") * 0.25 +
        scoreOf("cost") * 0.15 +
        scoreOf("speed") * 0.15 +
        scoreOf("safety") * 0.1,
      9,
    )
  })

  it("scores Cost and Speed from the sessions it resamples, so the two cannot disagree", () => {
    const result = compose()

    expect(result.dimensions.find((entry) => entry.scoreDimension === "cost")?.score).toBeCloseTo(result.cost.cost, 12)
    expect(result.dimensions.find((entry) => entry.scoreDimension === "speed")?.score).toBeCloseTo(
      result.speed.speed,
      12,
    )
  })

  it("carries every dimension with its weight and its score", () => {
    const result = compose()

    expect(result.dimensions.map((dimension) => dimension.scoreDimension)).toEqual([...SCORE_DIMENSIONS])
    expect(result.dimensions.every((dimension) => dimension.score !== undefined)).toBe(true)
    expect(result.dimensions.find((dimension) => dimension.scoreDimension === "outcome")?.weight).toBe(0.35)
  })

  it("never redistributes weight when a dimension is unmeasured", () => {
    const result = compose({ safety: safety({ coverage: "unmeasured", unmeasuredReason: "examinedFloor" }) })

    expect(result.composite).toBeUndefined()
    expect(result.dimensions.every((dimension) => dimension.weight)).toBe(true)
    expect(result.dimensions.map((dimension) => dimension.weight)).toEqual([0.35, 0.25, 0.15, 0.15, 0.1])
  })

  it("withholds every dimension number when one dimension is unmeasured", () => {
    const result = compose({ reliability: reliability({ coverage: "unmeasured", unmeasuredReason: "readableFloor" }) })

    expect(result.unmeasuredDimensions).toEqual(["reliability"])
    expect(result.dimensions.some((dimension) => dimension.score !== undefined)).toBe(false)
    expect(result.dimensions.some((dimension) => dimension.interval !== undefined)).toBe(false)
  })

  it("names the failing floor on the dimension that failed", () => {
    const result = compose({
      cost: { gate: costGate({ coverage: "unmeasured", unmeasuredReason: "requiredFamilyUnreadable" }) },
    })

    expect(result.dimensions.find((dimension) => dimension.scoreDimension === "cost")).toMatchObject({
      coverage: "unmeasured",
      unmeasuredReason: "requiredFamilyUnreadable",
    })
  })

  it("lists every unmeasured dimension, not only the first", () => {
    const result = compose({
      safety: safety({ coverage: "unmeasured", unmeasuredReason: "examinedFloor" }),
      outcome: outcome({ coverage: "unmeasured", unmeasuredReason: "coverageFloor" }),
    })

    expect([...result.unmeasuredDimensions].sort()).toEqual(["outcome", "safety"])
  })
})

describe("the composite interval", () => {
  it("is ordered and contains the point estimate", () => {
    const result = compose()

    expect(result.composite?.interval.lower).toBeLessThanOrEqual(result.composite?.score as number)
    expect(result.composite?.interval.upper).toBeGreaterThanOrEqual(result.composite?.score as number)
  })

  it("stays non-degenerate when no failure and no harm was observed", () => {
    // Resampling a constant outcome vector would produce zero width here, which would claim a
    // precision a clean window has not earned.
    const result = compose({
      outcome: outcome({ outcome: 100, sampledFailureCount: 0 }),
      reliability: reliability({ reliability: 100, terminalFailureSessionCount: 0, successRate: 1 }),
      safety: safety({ safety: 100, harmedSessionCount: 0, harmRate: 0 }),
    })

    expect((result.composite?.interval.upper as number) - (result.composite?.interval.lower as number)).toBeGreaterThan(
      0,
    )
  })

  it("widens as the examined population shrinks", () => {
    const wide = compose({
      outcome: outcome({ sampledSessionCount: 20, sampledFailureCount: 4, sampledWeight: 200 }),
      safety: safety({ examinedSessionCount: 50, harmedSessionCount: 1 }),
      reliability: reliability({ readableSessionCount: 40, terminalFailureSessionCount: 2 }),
    })
    const narrow = compose()

    const widthOf = (result: ReturnType<typeof compose>) =>
      (result.composite?.interval.upper as number) - (result.composite?.interval.lower as number)
    expect(widthOf(wide)).toBeGreaterThan(widthOf(narrow))
  })

  it("reproduces itself from the same seed and inputs", () => {
    expect(compose().composite?.interval).toEqual(compose().composite?.interval)
  })

  it("preserves Outcome sampling strata in composite replicates", () => {
    const judgedSessions = Array.from({ length: 100 }, (_, index) => ({
      sessionId: `weighted-outcome-${index}`,
      succeeded: index >= 20,
      inclusionProbability: index < 20 ? 0.01 : 1,
      judgmentVersion: "test",
    }))
    const outcomeOnly: AgentScoreArtifact = {
      ...LAUNCH_AGENT_SCORE_ARTIFACT,
      compositeWeights: { outcome: 1, reliability: 0, cost: 0, speed: 0, safety: 0 },
    }
    const weighted = compose({
      artifact: outcomeOnly,
      outcome: outcome({
        outcome: (100 * 80) / 2_080,
        sampledSessionCount: 100,
        sampledFailureCount: 20,
        sampledWeight: 2_080,
        judgedSessions,
      }),
    })
    const uniform = compose({
      artifact: outcomeOnly,
      outcome: outcome({
        outcome: 80,
        sampledSessionCount: 100,
        sampledFailureCount: 20,
        sampledWeight: 100,
        judgedSessions: judgedSessions.map((session) => ({ ...session, inclusionProbability: 1 })),
      }),
    })

    expect(weighted.composite?.interval.upper).toBeLessThan(uniform.composite?.interval.lower as number)
  })

  it("preserves Safety sampling strata in composite replicates", () => {
    const examinedSessions = Array.from({ length: 100 }, (_, index) => ({
      sessionId: `weighted-safety-${index}`,
      harmed: index < 20,
      examinationProbability: index < 20 ? 0.01 : 1,
    }))
    const safetyOnly: AgentScoreArtifact = {
      ...LAUNCH_AGENT_SCORE_ARTIFACT,
      compositeWeights: { outcome: 0, reliability: 0, cost: 0, speed: 0, safety: 1 },
    }
    const weighted = compose({
      artifact: safetyOnly,
      safety: safety({ examinedSessionCount: 100, harmedSessionCount: 20, examinedSessions }),
    })
    const uniform = compose({
      artifact: safetyOnly,
      safety: safety({
        examinedSessionCount: 100,
        harmedSessionCount: 20,
        examinedSessions: examinedSessions.map((session) => ({ ...session, examinationProbability: 1 })),
      }),
    })

    expect(weighted.composite?.interval.upper).toBeLessThan(uniform.composite?.interval.lower as number)
  })
})

describe("the published dimensions", () => {
  // The snapshot stores an interval beside every dimension and the trend plots all five, so a
  // dimension that publishes a score without one cannot be written at all.
  it("each carry an interval containing their own score", () => {
    const result = compose()

    expect(result.composite).toBeDefined()
    for (const dimension of result.dimensions) {
      expect(dimension.interval).toBeDefined()
      expect(dimension.interval?.lower).toBeLessThanOrEqual(dimension.score as number)
      expect(dimension.interval?.upper).toBeGreaterThanOrEqual(dimension.score as number)
    }
  })

  it("carry no interval when the window publishes nothing", () => {
    const result = compose({ outcome: outcome({ coverage: "unmeasured", unmeasuredReason: "examinedFloor" }) })

    expect(result.composite).toBeUndefined()
    expect(result.dimensions.every((dimension) => dimension.interval === undefined)).toBe(true)
  })
})

describe("the composite policy cap", () => {
  const withCap = (maxCompositeWithConfirmedHarm: number): AgentScoreArtifact => ({
    ...LAUNCH_AGENT_SCORE_ARTIFACT,
    policyCap: { maxCompositeWithConfirmedHarm },
  })

  it("does not exist unless the artifact enables it", () => {
    expect(compose().composite?.policyCap).toBeUndefined()
  })

  it("caps the composite when harm was confirmed, and says how many points the rule took", () => {
    const uncapped = compose().composite?.score as number
    const result = compose({ artifact: withCap(50) })

    expect(result.composite?.score).toBe(50)
    expect(result.composite?.policyCap).toMatchObject({ applied: true, cap: 50 })
    expect(result.composite?.policyCap?.removedPoints).toBeCloseTo(uncapped - 50, 9)
    expect(result.composite?.interval.upper).toBeLessThanOrEqual(50)
    expect(result.composite?.interval.lower).toBeLessThanOrEqual(result.composite?.score as number)
  })

  it("leaves a clean window alone even when the cap is enabled", () => {
    const result = compose({
      artifact: withCap(50),
      safety: safety({ harmedSessionCount: 0, safety: 100, harmRate: 0 }),
    })

    expect(result.composite?.policyCap).toMatchObject({ applied: false, removedPoints: 0 })
    expect(result.composite?.score).toBeGreaterThan(50)
  })

  it("does not cap a composite already below the cap", () => {
    const result = compose({ artifact: withCap(95) })

    expect(result.composite?.policyCap?.applied).toBe(false)
    expect(result.composite?.score).toBeLessThan(95)
  })
})

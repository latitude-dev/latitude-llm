import { SessionId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { LAUNCH_COST_SCORING_ARTIFACT } from "../artifacts/launch-cost-scoring-artifact.ts"
import { PROVISIONAL_COST_METRIC_CATALOG } from "../entities/cost-metric-catalog.ts"
import { unreadableReading } from "../entities/cost-metric-reading.ts"
import type { NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import { aggregateWindowCost, aggregateWindowSpeed, bootstrapWindow } from "./bootstrap-window.ts"
import {
  EMPTY_WINDOW_FOLD,
  finalizeWindowFold,
  foldSessionContribution,
  foldWindowBatch,
} from "./fold-window-contributions.ts"

const deadSurfaceSession = ({
  sessionId,
  usedToolNames = [],
  definitionName = "lookup",
  includeDefinition = true,
  includeContextPenalty = false,
}: {
  readonly sessionId: string
  readonly usedToolNames?: readonly string[]
  readonly definitionName?: string
  readonly includeDefinition?: boolean
  readonly includeContextPenalty?: boolean
}): NormalizedSessionAssessmentInput => ({
  sessionId: SessionId(sessionId),
  hasReadableUserTask: true,
  momentsAnalyzed: true,
  observedMicrocents: 0,
  observedDurationNs: 1_000,
  findings: [],
  readers: [],
  screeningDecisions: [],
  scoringEligibleSignalIds: [],
  costEvidence: {
    readings: [
      ...(includeDefinition
        ? [
            {
              metricId: "tools.dead_surface",
              family: "context" as const,
              rawUnit: "inputTokens" as const,
              aggregation: "resourceRatio" as const,
              applicability: "applicable" as const,
              readability: "readable" as const,
              rawValue: 0.2,
              eligibleUnits: 500,
              adverseUnits: 100,
              observations: [],
              limitations: [],
            },
          ]
        : []),
      ...(includeContextPenalty
        ? [
            {
              metricId: "context.redundant_input_share",
              family: "context" as const,
              rawUnit: "inputTokens" as const,
              aggregation: "resourceRatio" as const,
              applicability: "applicable" as const,
              readability: "readable" as const,
              rawValue: 0.2,
              eligibleUnits: 500,
              adverseUnits: 100,
              observations: [],
              limitations: [],
            },
          ]
        : []),
    ],
    toolNamesUsed: usedToolNames,
    toolDefinitionWindowObservations: includeDefinition ? [{ name: definitionName, inputTokens: 100 }] : [],
    workloadStratum: "test",
    denominators: { spend: 0, context: 0, tools: 0, memory: 0, recovery: 0 },
    observedCriticalPathNs: 1_000,
    criticalPathComplete: true,
    unreferencedLatencyModels: [],
    measuredAvoidableNs: 0,
    estimatedAvoidableNs: 0,
    measuredAvoidableMicrocents: 0,
    estimatedAvoidableMicrocents: 0,
    avoidableNsByCause: {},
  },
})

const foldDeadSurfaceSessions = (
  sessions: readonly NormalizedSessionAssessmentInput[],
  batchSize = sessions.length,
  artifact = LAUNCH_COST_SCORING_ARTIFACT,
) => {
  let fold = EMPTY_WINDOW_FOLD
  for (let offset = 0; offset < sessions.length; offset += batchSize) {
    fold = foldWindowBatch({
      fold,
      sessions: sessions.slice(offset, offset + batchSize),
      denominatorsFor: () => ({ spend: 0, context: 500, tools: 0, memory: 0, recovery: 0 }),
      artifact,
      catalog: PROVISIONAL_COST_METRIC_CATALOG,
    })
  }
  return finalizeWindowFold({ fold, artifact })
}

describe("foldWindowBatch", () => {
  it("retains readable Speed evidence when Cost is unpublishable", () => {
    const session: NormalizedSessionAssessmentInput = {
      sessionId: SessionId("session-1"),
      hasReadableUserTask: true,
      momentsAnalyzed: true,
      observedMicrocents: 0,
      observedDurationNs: 1_000,
      findings: [],
      readers: [],
      screeningDecisions: [],
      scoringEligibleSignalIds: [],
      costEvidence: {
        readings: [
          unreadableReading(
            {
              metricId: "cost.recoverable_spend_share",
              family: "spend",
              rawUnit: "microcents",
              aggregation: "resourceRatio",
            },
            ["missingPricing"],
            1_000,
          ),
        ],
        toolNamesUsed: [],
        toolDefinitionWindowObservations: [],
        workloadStratum: "test",
        denominators: { spend: 1_000, context: 0, tools: 0, memory: 0, recovery: 0 },
        observedCriticalPathNs: 1_000,
        criticalPathComplete: true,
        unreferencedLatencyModels: [],
        measuredAvoidableNs: 250,
        estimatedAvoidableNs: 0,
        measuredAvoidableMicrocents: 0,
        estimatedAvoidableMicrocents: 0,
        avoidableNsByCause: { "latency:throughput": 250 },
      },
    }
    const fold = foldWindowBatch({
      fold: EMPTY_WINDOW_FOLD,
      sessions: [session],
      denominatorsFor: () => ({ spend: 1_000, context: 0, tools: 0, memory: 0, recovery: 0 }),
      artifact: LAUNCH_COST_SCORING_ARTIFACT,
      catalog: PROVISIONAL_COST_METRIC_CATALOG,
    })

    expect(fold).toMatchObject({ foldedSessionCount: 0, withheldSessionCount: 1 })
    expect(fold.contributions).toHaveLength(1)
    expect(fold.contributions[0]?.costUsableForDenominator).toBe(false)
    expect(
      aggregateWindowCost({ contributions: fold.contributions, artifact: LAUNCH_COST_SCORING_ARTIFACT }).cost,
    ).toBe(100)
    expect(aggregateWindowSpeed(fold.contributions)).toMatchObject({ observedNs: 1_000, avoidableNs: 250, speed: 75 })
    expect(fold.speedCauseNs.get("latency:throughput")).toBe(250)
  })
})

describe("foldWindowBatch cost causes", () => {
  const healthySession = (sessionId: string): NormalizedSessionAssessmentInput => ({
    sessionId: SessionId(sessionId),
    hasReadableUserTask: true,
    momentsAnalyzed: true,
    observedMicrocents: 0,
    observedDurationNs: 1_000,
    findings: [],
    readers: [],
    screeningDecisions: [],
    scoringEligibleSignalIds: [],
    costEvidence: {
      readings: [
        {
          metricId: "tools.repeated_call",
          family: "tools",
          rawUnit: "toolCalls",
          aggregation: "eventRate",
          applicability: "applicable",
          readability: "readable",
          // Inside the curve's healthy band, so the metric resolves to a zero penalty.
          rawValue: 0,
          eligibleUnits: 10,
          adverseUnits: 0,
          observations: [],
          limitations: [],
        },
      ],
      toolNamesUsed: [],
      toolDefinitionWindowObservations: [],
      workloadStratum: "test",
      denominators: { spend: 0, context: 0, tools: 10, memory: 0, recovery: 0 },
      observedCriticalPathNs: 1_000,
      criticalPathComplete: true,
      unreferencedLatencyModels: [],
      measuredAvoidableNs: 0,
      estimatedAvoidableNs: 0,
      measuredAvoidableMicrocents: 0,
      estimatedAvoidableMicrocents: 0,
      avoidableNsByCause: { "latency:throughput": 0 },
    },
  })

  // A metric read as healthy used to reach the page as an "affected by" row reading "0 call
  // equivalents": measured, clean, and painted as a cause.
  it("does not record a cause for a metric that penalized nothing", () => {
    const fold = foldWindowBatch({
      fold: EMPTY_WINDOW_FOLD,
      sessions: [healthySession("session-1")],
      denominatorsFor: () => ({ spend: 0, context: 0, tools: 10, memory: 0, recovery: 0 }),
      artifact: LAUNCH_COST_SCORING_ARTIFACT,
      catalog: PROVISIONAL_COST_METRIC_CATALOG,
    })

    expect(fold.foldedSessionCount).toBe(1)
    expect([...fold.costCauseUnits.keys()]).toEqual([])
    expect([...fold.speedCauseNs.keys()]).toEqual([])
  })
})

describe("foldWindowBatch unreferenced latency models", () => {
  const speedSession = ({
    sessionId,
    unreferencedLatencyModels = [],
    criticalPathComplete = true,
  }: {
    readonly sessionId: string
    readonly unreferencedLatencyModels?: readonly { readonly provider: string; readonly model: string }[]
    readonly criticalPathComplete?: boolean
  }): NormalizedSessionAssessmentInput => ({
    sessionId: SessionId(sessionId),
    hasReadableUserTask: true,
    momentsAnalyzed: true,
    observedMicrocents: 0,
    observedDurationNs: 1_000,
    findings: [],
    readers: [],
    screeningDecisions: [],
    scoringEligibleSignalIds: [],
    costEvidence: {
      readings: [],
      toolNamesUsed: [],
      toolDefinitionWindowObservations: [],
      workloadStratum: "test",
      denominators: { spend: 0, context: 0, tools: 0, memory: 0, recovery: 0 },
      observedCriticalPathNs: 1_000,
      criticalPathComplete,
      unreferencedLatencyModels,
      measuredAvoidableNs: 100,
      estimatedAvoidableNs: 0,
      measuredAvoidableMicrocents: 0,
      estimatedAvoidableMicrocents: 0,
      avoidableNsByCause: { "recovered:tool": 100 },
    },
  })

  const foldBatch = (
    sessions: readonly NormalizedSessionAssessmentInput[],
    fold = EMPTY_WINDOW_FOLD,
  ): ReturnType<typeof foldWindowBatch> =>
    foldWindowBatch({
      fold,
      sessions,
      denominatorsFor: () => ({ spend: 0, context: 0, tools: 0, memory: 0, recovery: 0 }),
      artifact: LAUNCH_COST_SCORING_ARTIFACT,
      catalog: PROVISIONAL_COST_METRIC_CATALOG,
    })

  it("keeps a session whose path runs through an unreferenced model out of Speed", () => {
    const fold = foldBatch([
      speedSession({ sessionId: "referenced" }),
      speedSession({
        sessionId: "unreferenced",
        unreferencedLatencyModels: [{ provider: "openai", model: "gpt-5-mini" }],
      }),
    ])

    expect(fold.contributions.map((contribution) => contribution.speed)).toEqual([
      expect.objectContaining({ usableForDenominator: true, missingLatencyReference: false }),
      expect.objectContaining({ usableForDenominator: false, missingLatencyReference: true }),
    ])
    expect(aggregateWindowSpeed(fold.contributions)).toMatchObject({
      observedNs: 1_000,
      avoidableNs: 100,
      includedSessionCount: 1,
      excludedSessionCount: 1,
    })
    expect(fold.speedCauseNs.get("recovered:tool")).toBe(100)
  })

  it("tallies the unreferenced models per session across batches", () => {
    const gpt5Mini = { provider: "openai", model: "gpt-5-mini" }
    const sonnet = { provider: "anthropic", model: "claude-sonnet-4-5" }
    const first = foldBatch([speedSession({ sessionId: "a", unreferencedLatencyModels: [gpt5Mini, sonnet] })])
    const fold = foldBatch([speedSession({ sessionId: "b", unreferencedLatencyModels: [gpt5Mini] })], first)

    expect([...fold.unreferencedLatencyModels.values()]).toEqual([
      { ...gpt5Mini, sessionCount: 2 },
      { ...sonnet, sessionCount: 1 },
    ])
  })

  it("does not blame a missing reference for a session whose path did not reconstruct", () => {
    const fold = foldBatch([
      speedSession({
        sessionId: "incomplete",
        criticalPathComplete: false,
        unreferencedLatencyModels: [{ provider: "openai", model: "gpt-5-mini" }],
      }),
    ])

    expect(fold.contributions[0]?.speed).toMatchObject({ usableForDenominator: false, missingLatencyReference: false })
    expect(fold.unreferencedLatencyModels.size).toBe(0)
  })
})

describe("window dead-surface scoring", () => {
  it("does not penalize a definition used in another session in the scoring window", () => {
    const fold = foldDeadSurfaceSessions([
      deadSurfaceSession({ sessionId: "definition-session" }),
      deadSurfaceSession({
        sessionId: "call-session",
        usedToolNames: ["LOOKUP"],
        includeDefinition: false,
      }),
    ])

    expect(fold.contributions[0]?.families.find((family) => family.family === "context")?.penalizedUnits).toBe(0)
    expect(fold.costCauseUnits.has("tools.dead_surface")).toBe(false)
  })

  it("continues to penalize a definition that is never used in the window", () => {
    const fold = foldDeadSurfaceSessions([deadSurfaceSession({ sessionId: "unused-session" })])

    expect(fold.contributions[0]?.families.find((family) => family.family === "context")?.penalizedUnits).toBe(200)
    expect(fold.costCauseUnits.get("tools.dead_surface")).toEqual({ family: "context", penalizedUnits: 200 })
  })

  it("keeps window evidence on the single-session contribution path", () => {
    const contribution = foldSessionContribution({
      session: deadSurfaceSession({ sessionId: "unused-session" }),
      denominators: { spend: 0, context: 500, tools: 0, memory: 0, recovery: 0 },
      artifact: LAUNCH_COST_SCORING_ARTIFACT,
      catalog: PROVISIONAL_COST_METRIC_CATALOG,
    })

    expect(contribution.deadSurface?.eligibleInputTokens).toBe(500)
    expect(aggregateWindowCost({ contributions: [contribution], artifact: LAUNCH_COST_SCORING_ARTIFACT }).cost).toBe(90)
  })

  it("produces the same result when the window spans multiple batches", () => {
    const sessions = [
      deadSurfaceSession({ sessionId: "definition-session" }),
      deadSurfaceSession({
        sessionId: "call-session",
        usedToolNames: ["lookup"],
        includeDefinition: false,
      }),
    ]
    const singleBatch = foldDeadSurfaceSessions(sessions)
    const multipleBatches = foldDeadSurfaceSessions(sessions, 1)

    expect(multipleBatches.contributions).toEqual(singleBatch.contributions)
    expect(multipleBatches.costCauseUnits).toEqual(singleBatch.costCauseUnits)
    expect(
      aggregateWindowCost({ contributions: multipleBatches.contributions, artifact: LAUNCH_COST_SCORING_ARTIFACT }),
    ).toEqual(aggregateWindowCost({ contributions: singleBatch.contributions, artifact: LAUNCH_COST_SCORING_ARTIFACT }))
  })

  it("recomputes dead surface for each bootstrap window", () => {
    const fold = foldDeadSurfaceSessions([
      deadSurfaceSession({ sessionId: "definition-session" }),
      deadSurfaceSession({ sessionId: "call-session", usedToolNames: ["lookup"], includeDefinition: false }),
    ])
    const interval = bootstrapWindow({
      contributions: fold.contributions,
      artifact: LAUNCH_COST_SCORING_ARTIFACT,
      replicates: 400,
      seed: 11,
    })

    expect(interval.cost.point).toBe(100)
    expect(interval.cost.lower).toBeLessThan(interval.cost.upper)
    expect(interval.cost.upper).toBe(100)
  })

  it("attributes only the increase below the context family cap", () => {
    const cappedArtifact = {
      ...LAUNCH_COST_SCORING_ARTIFACT,
      familyCaps: { ...LAUNCH_COST_SCORING_ARTIFACT.familyCaps, context: 0.3 },
    }
    const fold = foldDeadSurfaceSessions(
      [deadSurfaceSession({ sessionId: "capped-session", includeContextPenalty: true })],
      undefined,
      cappedArtifact,
    )

    expect(fold.contributions[0]?.families.find((family) => family.family === "context")?.penalizedUnits).toBe(150)
    expect(fold.costCauseUnits.get("tools.dead_surface")?.family).toBe("context")
    expect(fold.costCauseUnits.get("tools.dead_surface")?.penalizedUnits).toBeCloseTo(50, 8)
  })
})

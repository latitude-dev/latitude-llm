import { type Score, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { ChSqlClient, OrganizationId, ProjectId, ScoreId, SessionId, SqlClient, TraceId } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "../artifacts/launch-agent-score-artifact.ts"
import { type SafetyWindowDecision, SafetyWindowDecisionSource } from "../ports/safety-window-source.ts"
import { estimateProjectSafetyWindow } from "./estimate-project-safety.ts"

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const VERSION = "safety-v1:amazon-bedrock/anthropic.claude-haiku-4-5"
const FROM = new Date("2026-01-01T00:00:00.000Z")
const TO = new Date("2026-01-08T00:00:00.000Z")
const SUITE = ["jailbreaking", "pii-leakage"] as const

const OPEN_FLOORS = { examinedSessions: 1, examinedShareOfEligible: 0, maxRateLimitedHintedShare: 1 }

const decision = (
  index: number,
  flaggerSlug: string,
  overrides: Partial<SafetyWindowDecision> = {},
): SafetyWindowDecision => ({
  sessionId: SessionId(`session-${index}`),
  flaggerSlug,
  analysisHash: `hash-${index}`,
  selected: true,
  reason: "ordinary-sample",
  inclusionProbability: 0.1,
  outcome: "unmatched",
  hintKinds: [],
  ...overrides,
})

const suiteDecisions = (index: number, overrides: Partial<SafetyWindowDecision> = {}) =>
  SUITE.map((slug) => decision(index, slug, overrides))

const safetyScore = (
  index: number,
  options: { readonly findingKind?: string; readonly version?: string; readonly slug?: string } = {},
): Score =>
  ({
    id: ScoreId(`score-${index}`.padEnd(24, "x").slice(0, 24)),
    organizationId: ORGANIZATION_ID,
    projectId: PROJECT_ID,
    sessionId: SessionId(`session-${index}`),
    traceId: TraceId("t".repeat(32)),
    spanId: null,
    simulationId: null,
    signalId: null,
    sourceType: "annotation",
    sourceId: "SYSTEM",
    value: 0,
    passed: false,
    feedback: "found",
    metadata: {
      rawFeedback: "raw",
      flaggerSlug: options.slug ?? "jailbreaking",
      flaggerPath: "sampled",
      safetyFindingKind: options.findingKind ?? "injectionCompliance",
      scoringArtifactVersion: options.version ?? VERSION,
    },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: null,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  }) as Score

const run = (input: {
  readonly decisions: readonly SafetyWindowDecision[]
  readonly scores: readonly Score[]
  readonly eligibleSessionCount?: number
  readonly batchSize?: number
  readonly floors?: typeof OPEN_FLOORS | undefined
}) => {
  const reads: number[] = []
  const suiteSlugsRead: string[][] = []
  const { repository } = createFakeScoreRepository({
    listBySessionsAndTraces: ({ sessionIds }) => {
      reads.push(sessionIds.length)
      return Effect.succeed(input.scores.filter((score) => sessionIds.includes(score.sessionId as SessionId)))
    },
  })

  const layer = Layer.mergeAll(
    Layer.succeed(SafetyWindowDecisionSource, {
      read: (scope) => {
        suiteSlugsRead.push([...scope.suiteSlugs])
        return Effect.succeed({
          eligibleSessionCount: input.eligibleSessionCount ?? 2_000,
          decisions: input.decisions,
        })
      },
    }),
    Layer.succeed(ScoreRepository, repository),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: ORGANIZATION_ID })),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORGANIZATION_ID })),
  )

  return Effect.runPromise(
    estimateProjectSafetyWindow({
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      from: FROM,
      to: TO,
      supportedJudgmentVersions: [VERSION],
      referenceRunSessions: LAUNCH_AGENT_SCORE_ARTIFACT.referenceRuns.safety,
      floors: "floors" in input ? (input.floors ?? LAUNCH_AGENT_SCORE_ARTIFACT.dimensionFloors.safety) : OPEN_FLOORS,
      ...(input.batchSize !== undefined ? { batchSize: input.batchSize } : {}),
    }).pipe(Effect.provide(layer)),
  ).then((estimate) => ({ estimate, reads, suiteSlugsRead }))
}

const examinedWindow = (count: number, harmedCount = 0) => ({
  decisions: Array.from({ length: count }, (_, index) => suiteDecisions(index)).flat(),
  scores: Array.from({ length: harmedCount }, (_, index) => safetyScore(index)),
})

describe("estimateProjectSafetyWindow", () => {
  it("reads the launch suite and joins its decisions to the harm it found", async () => {
    const { estimate, suiteSlugsRead } = await run(examinedWindow(100, 1))

    expect(suiteSlugsRead[0]).toEqual([...SUITE])
    expect(estimate).toMatchObject({ coverage: "measured", examinedSessionCount: 100, harmedSessionCount: 1 })
    expect(estimate.harmRate).toBeCloseTo(0.01, 10)
  })

  it("reads verdicts in bounded batches rather than one unbounded query", async () => {
    const { reads } = await run({ ...examinedWindow(12), batchSize: 5 })

    expect(reads).toEqual([5, 5, 2])
  })

  // Exposure and defense are persisted the same way harm is, so the join has to
  // read the finding kind rather than the presence of a Safety score.
  it("counts only confirmed harm, not exposure or a successful defense", async () => {
    const { estimate } = await run({
      decisions: examinedWindow(100).decisions,
      scores: [
        safetyScore(0, { findingKind: "injectionAttempt" }),
        safetyScore(1, { findingKind: "injectionDefense" }),
        safetyScore(2, { findingKind: "piiExposure", slug: "pii-leakage" }),
        safetyScore(3, { findingKind: "piiDisclosure", slug: "pii-leakage" }),
      ],
    })

    expect(estimate.harmedSessionCount).toBe(1)
  })

  it("unions two detectors harming one session into one harmed session", async () => {
    const { estimate } = await run({
      decisions: examinedWindow(100).decisions,
      scores: [safetyScore(0), { ...safetyScore(0), id: ScoreId("score-pii".padEnd(24, "x").slice(0, 24)) } as Score],
    })

    expect(estimate.harmedSessionCount).toBe(1)
  })

  it("withholds the window when any harm came from an unsupported judge", async () => {
    const { estimate } = await run({
      decisions: examinedWindow(100).decisions,
      scores: [safetyScore(0, { version: "safety-v1:other/model" })],
    })

    expect(estimate.examinedSessionCount).toBe(99)
    expect(estimate.excluded.incompatibleJudgmentVersion).toBe(1)
    expect(estimate).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "incompatibleJudgment" })
  })

  it("leaves a session with an incomplete suite out of the denominator", async () => {
    const partial = suiteDecisions(0).filter((entry) => entry.flaggerSlug === "jailbreaking")
    const { estimate } = await run({
      decisions: [...partial, ...examinedWindow(10, 0).decisions.slice(2)],
      scores: [],
    })

    expect(estimate.excluded.incompleteSuite).toBe(1)
    expect(estimate.examinedSessionCount).toBe(9)
  })

  // The launch artifact's floors are the shipped ones; the rest of this file opens
  // them so the join is testable without a thousand fixtures.
  it("publishes no number under the shipped floors when the window is small", async () => {
    const layerRun = await run({ ...examinedWindow(100), floors: undefined })

    expect(layerRun.estimate).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "examinedFloor" })
    expect(layerRun.estimate.safety).toBeUndefined()
  })
})

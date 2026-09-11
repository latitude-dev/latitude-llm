import { type Score, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { ChSqlClient, OrganizationId, ProjectId, ScoreId, SessionId, SqlClient, TraceId } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type OutcomeWindowDecision, OutcomeWindowDecisionSource } from "../ports/outcome-window-source.ts"
import { estimateProjectOutcomeWindow } from "./estimate-project-outcome.ts"

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const VERSION = "task-failure-v1:amazon-bedrock/anthropic.claude-haiku-4-5"
const FROM = new Date("2026-01-01T00:00:00.000Z")
const TO = new Date("2026-01-08T00:00:00.000Z")

const decision = (index: number, overrides: Partial<OutcomeWindowDecision> = {}): OutcomeWindowDecision => ({
  sessionId: SessionId(`session-${index}`),
  analysisHash: `hash-${index}`,
  selected: true,
  reason: "ordinary-sample",
  inclusionProbability: 0.1,
  outcome: "success",
  ...overrides,
})

// `exactOptionalPropertyTypes` forbids passing an explicit undefined, and these
// two fields genuinely absent is the case under test.
const withoutOutcome = (index: number): OutcomeWindowDecision => {
  const { outcome: _outcome, ...rest } = decision(index)
  return rest
}

const withoutInclusionProbability = (index: number): OutcomeWindowDecision => {
  const { inclusionProbability: _probability, ...rest } = decision(index)
  return rest
}

const verdictScore = (
  index: number,
  overrides: { readonly passed?: boolean; readonly analysisHash?: string; readonly version?: string } = {},
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
    value: overrides.passed === false ? 0 : 1,
    passed: overrides.passed ?? true,
    feedback: "judged",
    metadata: {
      rawFeedback: "raw",
      flaggerSlug: "task-failure",
      flaggerPath: "sampled",
      analysisHash: overrides.analysisHash ?? `hash-${index}`,
      scoringArtifactVersion: overrides.version ?? VERSION,
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
  readonly decisions: readonly OutcomeWindowDecision[]
  readonly scores: readonly Score[]
  readonly eligibleSessionCount?: number
  readonly deterministicFailureSessionIds?: readonly string[]
  readonly batchSize?: number
}) => {
  const reads: number[] = []
  const { repository } = createFakeScoreRepository({
    listBySessionsAndTraces: ({ sessionIds }) => {
      reads.push(sessionIds.length)
      return Effect.succeed(input.scores.filter((score) => sessionIds.includes(score.sessionId as SessionId)))
    },
  })

  const layer = Layer.mergeAll(
    Layer.succeed(OutcomeWindowDecisionSource, {
      read: () =>
        Effect.succeed({
          eligibleSessionCount: input.eligibleSessionCount ?? 2_000,
          decisions: input.decisions,
        }),
    }),
    Layer.succeed(ScoreRepository, repository),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: ORGANIZATION_ID })),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORGANIZATION_ID })),
  )

  return Effect.runPromise(
    estimateProjectOutcomeWindow({
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      from: FROM,
      to: TO,
      supportedJudgmentVersions: [VERSION],
      ...(input.deterministicFailureSessionIds
        ? { deterministicFailureSessionIds: input.deterministicFailureSessionIds }
        : {}),
      ...(input.batchSize !== undefined ? { batchSize: input.batchSize } : {}),
    }).pipe(Effect.provide(layer)),
  ).then((estimate) => ({ estimate, reads }))
}

const judgedWindow = (count: number, successRate = 0.8) => {
  const decisions = Array.from({ length: count }, (_, index) =>
    decision(index, { outcome: index < count * successRate ? "success" : "failure" }),
  )
  const scores = decisions.map((_, index) => verdictScore(index, { passed: index < count * successRate }))
  return { decisions, scores }
}

describe("estimateProjectOutcomeWindow", () => {
  it("joins decisions to their verdicts and corrects for selection", async () => {
    const { estimate } = await run(judgedWindow(200))

    expect(estimate.coverage).toBe("measured")
    expect(estimate.outcome).toBeCloseTo(80, 10)
    expect(estimate.sampledSessionCount).toBe(200)
    expect(estimate.eligibleSessionCount).toBe(2_000)
  })

  // The decision says which generation was judged; a score from an older one is
  // operational history, not this window's answer.
  it("ignores a verdict from a generation the newest decision does not name", async () => {
    const { decisions, scores } = judgedWindow(200)
    const stale = [...scores]
    stale[0] = verdictScore(0, { analysisHash: "an-older-generation" })

    const { estimate } = await run({ decisions, scores: stale })

    expect(estimate.sampledSessionCount).toBe(199)
  })

  it("leaves a pending or indeterminate newest generation unexamined", async () => {
    const { decisions, scores } = judgedWindow(200)
    const withCoverage = [
      ...decisions,
      withoutOutcome(900),
      decision(901, { outcome: "indeterminate" }),
      decision(902, { outcome: "error" }),
      { ...withoutOutcome(903), selected: false },
    ]

    const { estimate } = await run({ decisions: withCoverage, scores })

    expect(estimate.sampledSessionCount).toBe(200)
  })

  it("excludes a verdict written by an unsupported judge", async () => {
    const { decisions, scores } = judgedWindow(200)
    const mixed = [...scores]
    mixed[0] = verdictScore(0, { version: "task-failure-v1:ollama/llama-3.1-8b" })

    const { estimate } = await run({ decisions, scores: mixed })

    expect(estimate.excluded.incompatibleJudgmentVersion).toBe(1)
    expect(estimate.sampledSessionCount).toBe(199)
  })

  it("treats a decision with no stored probability as unusable rather than certain", async () => {
    const { decisions, scores } = judgedWindow(200)
    const withUnknown = [...decisions]
    withUnknown[0] = withoutInclusionProbability(0)

    const { estimate } = await run({ decisions: withUnknown, scores })

    expect(estimate.excluded.unknownInclusionProbability).toBe(1)
    expect(estimate.sampledSessionCount).toBe(199)
  })

  it("combines the deterministic census with the judged sample", async () => {
    const { decisions, scores } = judgedWindow(200)

    const { estimate } = await run({
      decisions,
      scores,
      deterministicFailureSessionIds: Array.from({ length: 100 }, (_, index) => `deterministic-${index}`),
    })

    expect(estimate.deterministicSessionCount).toBe(100)
    expect(estimate.examinedSessionCount).toBe(300)
    expect(estimate.outcome!).toBeLessThan(80)
  })

  it("reads verdicts in bounded batches rather than one unbounded query", async () => {
    const { reads } = await run({ ...judgedWindow(200), batchSize: 60 })

    expect(reads).toEqual([60, 60, 60, 20])
  })
})

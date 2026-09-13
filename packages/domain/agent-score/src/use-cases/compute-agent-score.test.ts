import { ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { ChSqlClient, OrganizationId, ProjectId, SessionId, SqlClient, TraceId } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import type { SessionDetail } from "@domain/spans"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "../artifacts/launch-agent-score-artifact.ts"
import { LAUNCH_COST_SCORING_ARTIFACT } from "../artifacts/launch-cost-scoring-artifact.ts"
import { LAUNCH_LATENCY_REFERENCE_ARTIFACT } from "../artifacts/launch-latency-reference-artifact.ts"
import type { AgentScoreArtifact } from "../entities/agent-score-artifact.ts"
import { PROVISIONAL_COST_METRIC_CATALOG } from "../entities/cost-metric-catalog.ts"
import { OutcomeWindowDecisionSource } from "../ports/outcome-window-source.ts"
import { SafetyWindowDecisionSource } from "../ports/safety-window-source.ts"
import { ScoreWindowSource } from "../ports/score-window-source.ts"
import {
  SessionAssessmentBulkJudgmentSource,
  SessionAssessmentBulkTelemetrySource,
} from "../ports/session-assessment-sources.ts"
import { computeAgentScore } from "./compute-agent-score.ts"

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const TO = new Date("2026-09-29T00:00:00.000Z")
const JUDGE = { provider: "amazon-bedrock", model: "anthropic.claude-haiku-4-5-20251001-v1:0" }

const OPEN_ARTIFACT: AgentScoreArtifact = {
  ...LAUNCH_AGENT_SCORE_ARTIFACT,
  window: { ...LAUNCH_AGENT_SCORE_ARTIFACT.window, sessionTarget: 10, sessionFloor: 2 },
  dimensionFloors: {
    outcome: { examinedSessions: 1, examinedShareOfEligible: 0 },
    reliability: { readableSessions: 1, readableShareOfEligible: 0 },
    cost: { publishableSessionShare: 0 },
    speed: { completeCriticalPathSessions: 0, completeCriticalPathShareOfEligible: 0 },
    safety: { examinedSessions: 1, examinedShareOfEligible: 0, maxRateLimitedHintedShare: 1 },
  },
}

const sessionDetail = (sessionId: string): SessionDetail =>
  ({
    organizationId: ORGANIZATION_ID,
    projectId: PROJECT_ID,
    sessionId: SessionId(sessionId),
    traceIds: [TraceId(`trace-${sessionId}`)],
    systemInstructions: [],
    inputMessages: [{ role: "user", parts: [{ type: "text", content: "Cancel my subscription" }] }],
    lastInputMessages: [],
    outputMessages: [{ role: "assistant", parts: [{ type: "text", content: "Done" }] }],
    tags: [],
    definedTools: [],
    tokensInput: 1,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    costTotalMicrocents: 2,
    durationNs: 3,
    startTime: new Date("2026-09-27T00:00:00.000Z"),
    endTime: new Date("2026-09-27T00:00:01.000Z"),
  }) as unknown as SessionDetail

interface Harness {
  readonly sessionCount?: number
  readonly countsByStep?: Readonly<Record<number, number>>
  readonly artifact?: AgentScoreArtifact
  readonly previousStepDays?: number
  readonly judge?: { readonly provider: string; readonly model: string }
}

const run = (harness: Harness = {}) => {
  const sessionCount = harness.sessionCount ?? 6
  const sessionIds = Array.from({ length: sessionCount }, (_, index) => SessionId(`session-${index}`))
  const counts = harness.countsByStep ?? { 7: sessionCount, 14: sessionCount, 21: sessionCount, 28: sessionCount }
  const telemetryReads: number[] = []

  const { repository } = createFakeScoreRepository({ listBySessionsAndTraces: () => Effect.succeed([]) })

  const layer = Layer.mergeAll(
    Layer.succeed(ScoreWindowSource, {
      readEligibleCounts: ({ stepDays }) =>
        Effect.succeed(stepDays.map((days) => ({ stepDays: days, eligibleSessions: counts[days] ?? 0 }))),
      readEligibleSessionIds: () => Effect.succeed(sessionIds),
    }),
    Layer.succeed(SessionAssessmentBulkTelemetrySource, {
      read: ({ sessionIds: batch }) => {
        telemetryReads.push(batch.length)
        return Effect.succeed(
          batch.map((sessionId) => ({
            session: sessionDetail(sessionId as string),
            spans: [],
            generations: [],
            toolCalls: [],
            memoryEvents: [],
            moments: { moments: [], labels: [] },
            screeningDecisions: [],
            scoringEligibleSignalIds: [],
          })),
        )
      },
    }),
    Layer.succeed(SessionAssessmentBulkJudgmentSource, { read: () => Effect.succeed([]) }),
    Layer.succeed(OutcomeWindowDecisionSource, {
      read: () => Effect.succeed({ eligibleSessionCount: sessionCount, decisions: [] }),
    }),
    Layer.succeed(SafetyWindowDecisionSource, {
      read: () => Effect.succeed({ eligibleSessionCount: sessionCount, decisions: [] }),
    }),
    Layer.succeed(ScoreRepository, repository),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: ORGANIZATION_ID })),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORGANIZATION_ID })),
  )

  return Effect.runPromise(
    computeAgentScore({
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      to: TO,
      artifact: harness.artifact ?? OPEN_ARTIFACT,
      costArtifact: LAUNCH_COST_SCORING_ARTIFACT,
      catalog: PROVISIONAL_COST_METRIC_CATALOG,
      latencyArtifact: LAUNCH_LATENCY_REFERENCE_ARTIFACT,
      judge: harness.judge ?? JUDGE,
      batchSize: 2,
      replicates: 20,
      seed: 3,
      ...(harness.previousStepDays !== undefined ? { previousStepDays: harness.previousStepDays } : {}),
    }).pipe(Effect.provide(layer)),
  ).then((result) => ({ result, telemetryReads }))
}

describe("computeAgentScore", () => {
  it("withholds scores but still reads evidence when the project is under the floor", async () => {
    const { result, telemetryReads } = await run({ countsByStep: { 7: 1, 14: 1, 21: 1, 28: 1 }, sessionCount: 1 })

    expect(result).toMatchObject({ status: "withheld", withheldReason: "sessionFloor" })
    expect(result.window).toMatchObject({
      stepDays: 28,
      reason: "belowSessionFloor",
      eligibleSessionCount: 1,
    })
    expect(result.sessionFloor).toBe(2)
    expect(result.dimensions.some((dimension) => dimension.score !== undefined)).toBe(false)
    expect(result.coverage?.readSessionCount).toBe(1)
    expect(telemetryReads).toEqual([1])
  })

  it("selects the window before reading, and records the step it chose", async () => {
    const { result } = await run({ countsByStep: { 7: 4, 14: 12, 21: 20, 28: 30 }, sessionCount: 12 })

    expect(result.window).toMatchObject({ stepDays: 14, reason: "reachedTarget", eligibleSessionCount: 12 })
  })

  it("holds the previous step when the shorter one has not cleared the margin", async () => {
    const { result } = await run({ countsByStep: { 7: 10, 14: 20, 21: 30, 28: 40 }, previousStepDays: 14 })

    expect(result.window).toMatchObject({ stepDays: 14, reason: "heldByHysteresis" })
  })

  it("reads the window once, in bounded batches", async () => {
    const { telemetryReads } = await run({ sessionCount: 6 })

    expect(telemetryReads).toEqual([2, 2, 2])
  })

  it("withholds every dimension number when a sampled dimension was never examined", async () => {
    // No screening decisions, so Outcome and Safety have no examined population at all.
    const { result } = await run()

    expect(result.status).toBe("withheld")
    expect(result.withheldReason).toBe("unmeasuredDimensions")
    expect([...result.dimensions.map((dimension) => dimension.scoreDimension)].sort()).toEqual([
      "cost",
      "outcome",
      "reliability",
      "safety",
      "speed",
    ])
    expect(result.dimensions.some((dimension) => dimension.score !== undefined)).toBe(false)
    expect(result.composite).toBeUndefined()
  })

  it("names the floor each unmeasured dimension missed", async () => {
    const { result } = await run()

    expect(result.dimensions.find((dimension) => dimension.scoreDimension === "outcome")?.unmeasuredReason).toBe(
      "examinedFloor",
    )
    expect(result.dimensions.find((dimension) => dimension.scoreDimension === "safety")?.unmeasuredReason).toBe(
      "examinedFloor",
    )
  })

  it("still reports coverage and native inputs when it publishes nothing", async () => {
    const { result } = await run()

    expect(result.coverage?.readSessionCount).toBe(6)
    expect(result.coverage?.eligibleSessionCount).toBe(6)
    expect(result.coverage?.reliability.readableSessionCount).toBeGreaterThan(0)
    expect(result.native?.speed).toBeDefined()
  })

  it("reports per-reader coverage and the artifacts it loaded", async () => {
    const { result } = await run()
    const outputReader = result.coverage?.readers.find((reader) => reader.readerId === "sessions.no_output")

    expect(outputReader).toMatchObject({ applicableSessions: 6, fullyReadSessions: 6, coverage: 1 })
    // These sessions carry no generations, so the latency readers are not applicable rather than
    // unreadable. They still appear in coverage, which is what lets the page say so.
    expect(result.coverage?.readers.find((reader) => reader.readerId === "spans.ttft")).toMatchObject({
      applicableSessions: 0,
      coverage: 1,
    })
    expect(result.coverage?.artifactVersions.latency).toBe(LAUNCH_LATENCY_REFERENCE_ARTIFACT.artifactVersion)
  })

  it("labels the run with the bundled scoring version", async () => {
    const { result } = await run()

    expect(result.scoringVersion).toBe(LAUNCH_AGENT_SCORE_ARTIFACT.scoringVersion)
  })

  it("labels a substituted judge with its own version, so two judges never pool", async () => {
    const { result } = await run({ judge: { provider: "openai", model: "gpt-5-mini" } })

    expect(result.scoringVersion).not.toBe(LAUNCH_AGENT_SCORE_ARTIFACT.scoringVersion)
    expect(result.scoringVersion.startsWith(`${LAUNCH_AGENT_SCORE_ARTIFACT.scoringVersion}+local`)).toBe(true)
  })

  it("builds issue tables from the same pass, without a second read", async () => {
    const { result, telemetryReads } = await run({ sessionCount: 4 })

    expect(result.issues).toEqual({ outcome: [], safety: { confirmedHarm: [], exposure: [] } })
    expect(telemetryReads).toEqual([2, 2])
  })

  it("reads Reliability off the same pass, without a window source of its own", async () => {
    const { result } = await run({ sessionCount: 4 })

    expect(result.coverage?.reliability.readableSessionCount).toBe(4)
    expect(result.coverage?.reliability.terminalFailureSessionCount).toBe(0)
  })
})

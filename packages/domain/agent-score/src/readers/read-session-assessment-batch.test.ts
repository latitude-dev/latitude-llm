import type { Score } from "@domain/scores"
import { ChSqlClient, OrganizationId, ProjectId, ScoreId, SessionId, SqlClient, TraceId } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import type { SessionDetail } from "@domain/spans"
import { Effect, Layer } from "effect"
import { describe, expect, it, vi } from "vitest"
import {
  SessionAssessmentBulkJudgmentSource,
  SessionAssessmentBulkTelemetrySource,
} from "../ports/session-assessment-sources.ts"
import { getSessionAssessment } from "../use-cases/get-session-assessment.ts"
import { readSessionAssessmentBatch, readSessionAssessmentInputBatch } from "./read-session-assessment-batch.ts"

const makeSession = (sessionId: string, traceId: string): SessionDetail =>
  ({
    organizationId: OrganizationId("org-1"),
    projectId: ProjectId("project-1"),
    sessionId: SessionId(sessionId),
    traceIds: [TraceId(traceId)],
    systemInstructions: [],
    inputMessages: [],
    lastInputMessages: [],
    outputMessages: [{ role: "assistant", parts: [{ type: "text", content: "Done" }] }],
    tags: [],
    definedTools: [],
    tokensInput: 1,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    costTotalMicrocents: 2,
    durationNs: 3,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
  }) as unknown as SessionDetail

// A persisted judgement is the one assessment input that does not come from
// telemetry, so parity has to cover it: the single-session path and the window
// job must read the same verdict for the same session.
const taskOutcomeVerdict = (sessionId: string, traceId: string): Score =>
  ({
    id: ScoreId(`score-${sessionId}`),
    organizationId: OrganizationId("org-1"),
    projectId: ProjectId("project-1"),
    sessionId: SessionId(sessionId),
    traceId: TraceId(traceId),
    spanId: null,
    simulationId: null,
    signalId: null,
    sourceType: "annotation",
    sourceId: "SYSTEM",
    value: 1,
    passed: true,
    feedback: "Cancelled the subscription and confirmed the date.",
    metadata: {
      rawFeedback: "raw",
      flaggerSlug: "task-failure",
      flaggerPath: "sampled",
      scoringArtifactVersion: "task-failure-v1:amazon-bedrock/anthropic.claude-haiku-4-5",
      analysisHash: "a".repeat(64),
      messageIndex: 0,
    },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  }) as Score

// The structured Safety finding is the second persisted judgement, and it is
// read through a different branch than the verdict, so parity has to carry both.
const safetyFinding = (sessionId: string, traceId: string): Score =>
  ({
    ...taskOutcomeVerdict(sessionId, traceId),
    id: ScoreId(`score-safety-${sessionId}`),
    passed: false,
    value: 0,
    feedback: "The agent printed its hidden system prompt.",
    metadata: {
      rawFeedback: "raw",
      flaggerSlug: "jailbreaking",
      flaggerPath: "sampled",
      scoringArtifactVersion: "safety-v1:amazon-bedrock/anthropic.claude-haiku-4-5",
      analysisHash: "a".repeat(64),
      safetyFindingKind: "injectionCompliance",
      messageIndex: 0,
    },
  }) as Score

describe("readSessionAssessmentBatch", () => {
  it("reads each bulk source once and resolves every session through the shared pipeline", async () => {
    let telemetryReads = 0
    let judgmentReads = 0
    const sessions = [makeSession("session-1", "trace-1"), makeSession("session-2", "trace-2")]
    const telemetryLayer = Layer.succeed(SessionAssessmentBulkTelemetrySource, {
      read: () => {
        telemetryReads += 1
        return Effect.succeed(
          sessions.map((session) => ({
            session,
            spans: [],
            generations: [],
            toolCalls: [],
            memoryEvents: [],
            moments: { moments: [], labels: [] },
            screeningDecisions: [],
          })),
        )
      },
    })
    const judgmentLayer = Layer.succeed(SessionAssessmentBulkJudgmentSource, {
      read: (input) => {
        judgmentReads += 1
        expect(input.sessions.map(({ traceIds }) => traceIds)).toEqual([["trace-1"], ["trace-2"]])
        return Effect.succeed(input.sessions.map(({ sessionId }) => ({ sessionId, scores: [], signals: [] })))
      },
    })

    const result = await Effect.runPromise(
      readSessionAssessmentBatch({
        organizationId: OrganizationId("org-1"),
        projectId: ProjectId("project-1"),
        sessionIds: sessions.map(({ sessionId }) => sessionId),
        cutoff: new Date("2026-01-02T00:00:00.000Z"),
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            telemetryLayer,
            judgmentLayer,
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId("org-1") })),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId("org-1") })),
          ),
        ),
      ),
    )

    expect(telemetryReads).toBe(1)
    expect(judgmentReads).toBe(1)
    expect(result.map(({ sessionId }) => sessionId)).toEqual(["session-1", "session-2"])
    expect(result.every(({ dimensions }) => dimensions.length === 5)).toBe(true)
    expect(result.every(({ items }) => items.some(({ metricId }) => metricId === "sessions.usable_completion"))).toBe(
      true,
    )
  })

  it("does not call sources for an empty batch", async () => {
    const fail = () => Effect.die("unexpected source read")
    const result = await Effect.runPromise(
      readSessionAssessmentBatch({
        organizationId: OrganizationId("org-1"),
        projectId: ProjectId("project-1"),
        sessionIds: [],
        cutoff: new Date("2026-01-02T00:00:00.000Z"),
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(SessionAssessmentBulkTelemetrySource, { read: fail }),
            Layer.succeed(SessionAssessmentBulkJudgmentSource, { read: fail }),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId("org-1") })),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId("org-1") })),
          ),
        ),
      ),
    )

    expect(result).toEqual([])
  })

  it("keeps normalized facts and resolved semantics byte-identical between single and bulk reads", async () => {
    vi.useFakeTimers()
    const cutoff = new Date("2026-01-02T00:00:00.000Z")
    vi.setSystemTime(cutoff)
    const sessions = [makeSession("session-1", "trace-1"), makeSession("session-2", "trace-2")]
    const telemetryLayer = Layer.succeed(SessionAssessmentBulkTelemetrySource, {
      read: (input) =>
        Effect.succeed(
          sessions
            .filter((session) => input.sessionIds.includes(session.sessionId))
            .map((session) => ({
              session,
              spans: [],
              generations: [],
              toolCalls: [],
              memoryEvents: [],
              moments: { moments: [], labels: [] },
              screeningDecisions: [],
            })),
        ),
    })
    const judgmentLayer = Layer.succeed(SessionAssessmentBulkJudgmentSource, {
      read: (input) =>
        Effect.succeed(
          input.sessions.map(({ sessionId, traceIds }) => ({
            sessionId,
            scores: [
              taskOutcomeVerdict(sessionId, traceIds[0] ?? "trace-1"),
              safetyFinding(sessionId, traceIds[0] ?? "trace-1"),
            ],
            signals: [],
          })),
        ),
    })
    const layer = Layer.mergeAll(
      telemetryLayer,
      judgmentLayer,
      Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId("org-1") })),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId("org-1") })),
    )
    const scope = {
      organizationId: OrganizationId("org-1"),
      projectId: ProjectId("project-1"),
      cutoff,
    }

    try {
      const [singleFacts, bulkFacts, singleAssessment, bulkAssessments] = await Effect.runPromise(
        Effect.all([
          readSessionAssessmentInputBatch({ ...scope, sessionIds: [SessionId("session-1")] }),
          readSessionAssessmentInputBatch({
            ...scope,
            sessionIds: [SessionId("session-1"), SessionId("session-2")],
          }),
          getSessionAssessment({
            organizationId: scope.organizationId,
            projectId: scope.projectId,
            sessionId: SessionId("session-1"),
          }),
          readSessionAssessmentBatch({
            ...scope,
            sessionIds: [SessionId("session-1"), SessionId("session-2")],
          }),
        ]).pipe(Effect.provide(layer)),
      )
      const bulkSessionFacts = bulkFacts.find((facts) => facts.sessionId === "session-1")
      const bulkSessionAssessment = bulkAssessments.find((assessment) => assessment.sessionId === "session-1")
      const { nextCursor: _nextCursor, ...singleSemantics } = singleAssessment

      expect(JSON.stringify(singleFacts[0])).toBe(JSON.stringify(bulkSessionFacts))
      expect(JSON.stringify(singleSemantics)).toBe(JSON.stringify(bulkSessionAssessment))
      expect(singleAssessment.items).toContainEqual(
        expect.objectContaining({ metricId: "sessions.task_success", polarity: "positive" }),
      )
      expect(singleAssessment.items).toContainEqual(
        expect.objectContaining({ metricId: "safety.confirmed_failure", polarity: "negative" }),
      )
    } finally {
      vi.useRealTimers()
    }
  })
})

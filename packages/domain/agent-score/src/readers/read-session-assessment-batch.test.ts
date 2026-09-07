import { OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import type { SessionDetail } from "@domain/spans"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  SessionAssessmentBulkJudgmentSource,
  SessionAssessmentBulkTelemetrySource,
} from "../ports/session-assessment-sources.ts"
import { readSessionAssessmentBatch } from "./read-session-assessment-batch.ts"

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
      }).pipe(Effect.provide(Layer.merge(telemetryLayer, judgmentLayer))),
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
          Layer.merge(
            Layer.succeed(SessionAssessmentBulkTelemetrySource, { read: fail }),
            Layer.succeed(SessionAssessmentBulkJudgmentSource, { read: fail }),
          ),
        ),
      ),
    )

    expect(result).toEqual([])
  })
})

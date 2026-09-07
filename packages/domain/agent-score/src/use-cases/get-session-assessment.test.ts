import { ChSqlClient, OrganizationId, ProjectId, SessionId, SqlClient, TraceId } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import type { SessionDetail } from "@domain/spans"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  SessionAssessmentBulkJudgmentSource,
  SessionAssessmentBulkTelemetrySource,
} from "../ports/session-assessment-sources.ts"
import { getSessionAssessment } from "./get-session-assessment.ts"

const organizationId = OrganizationId("org-1")
const projectId = ProjectId("project-1")
const sessionId = SessionId("session-1")

const session = {
  organizationId,
  projectId,
  sessionId,
  traceIds: [TraceId("trace-1"), TraceId("trace-2")],
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
} as unknown as SessionDetail

const clientLayer = Layer.mergeAll(
  Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
  Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
)

describe("getSessionAssessment", () => {
  it("scopes every source and derives score trace ids from the authorized session", async () => {
    const telemetryLayer = Layer.succeed(SessionAssessmentBulkTelemetrySource, {
      read: (input) => {
        expect(input).toEqual({
          organizationId,
          projectId,
          sessionIds: [sessionId],
          cutoff: expect.any(Date),
        })
        return Effect.succeed([{ session, spans: [], moments: { moments: [], labels: [] }, screeningDecisions: [] }])
      },
    })
    const judgmentLayer = Layer.succeed(SessionAssessmentBulkJudgmentSource, {
      read: (input) => {
        expect(input.organizationId).toBe(organizationId)
        expect(input.projectId).toBe(projectId)
        expect(input.sessionIds).toEqual([sessionId])
        expect(input.sessions).toEqual([{ sessionId, traceIds: [TraceId("trace-1"), TraceId("trace-2")] }])
        return Effect.succeed([{ sessionId, scores: [], signals: [] }])
      },
    })

    const result = await Effect.runPromise(
      getSessionAssessment({ organizationId, projectId, sessionId }).pipe(
        Effect.provide(Layer.mergeAll(clientLayer, telemetryLayer, judgmentLayer)),
      ),
    )

    expect(result.sessionId).toBe(sessionId)
    expect(result.dimensions).toHaveLength(5)
  })

  it("returns not found when the scoped session source cannot see the session", async () => {
    const result = await Effect.runPromise(
      Effect.flip(
        getSessionAssessment({ organizationId, projectId, sessionId }).pipe(
          Effect.provide(
            Layer.mergeAll(
              clientLayer,
              Layer.succeed(SessionAssessmentBulkTelemetrySource, { read: () => Effect.succeed([]) }),
              Layer.succeed(SessionAssessmentBulkJudgmentSource, { read: () => Effect.die("unexpected read") }),
            ),
          ),
        ),
      ),
    )

    expect(result).toMatchObject({ _tag: "NotFoundError", entity: "Session", id: sessionId })
  })
})

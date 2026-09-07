import { SessionAssessmentBulkJudgmentSource } from "@domain/agent-score"
import { type Score, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { OrganizationId, ProjectId, SessionId, SignalId, SqlClient, TraceId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { SignalRepository } from "@domain/signals"
import { createFakeSignalRepository } from "@domain/signals/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SessionAssessmentBulkJudgmentSourceLive } from "./session-assessment-bulk-source.ts"

const organizationId = OrganizationId("org-1")
const projectId = ProjectId("project-1")
const session1 = SessionId("session-1")
const session2 = SessionId("session-2")
const trace1 = TraceId("trace-1")
const trace2 = TraceId("trace-2")
const cutoff = new Date("2026-01-02T00:00:00.000Z")

describe("SessionAssessmentBulkJudgmentSourceLive", () => {
  it("loads scores and linked signals once and groups orphan scores by trace", async () => {
    let scoreReads = 0
    let signalReads = 0
    const score = {
      id: "score-1",
      organizationId,
      projectId,
      sessionId: null,
      traceId: trace2,
      signalId: SignalId("signal-1"),
    } as unknown as Score
    const scoreRepository = createFakeScoreRepository({
      listBySessionsAndTraces: (input) => {
        scoreReads += 1
        expect(input).toMatchObject({
          organizationId,
          projectId,
          sessionIds: [session1, session2],
          traceIds: [trace1, trace2],
          createdAtTo: cutoff,
        })
        return Effect.succeed([score])
      },
    }).repository
    const signalRepository = createFakeSignalRepository([], {
      findByIds: (input) => {
        signalReads += 1
        expect(input).toEqual({ projectId, signalIds: [SignalId("signal-1")] })
        return Effect.succeed([])
      },
    }).repository
    const dependencies = Layer.mergeAll(
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
      Layer.succeed(ScoreRepository, scoreRepository),
      Layer.succeed(SignalRepository, signalRepository),
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* SessionAssessmentBulkJudgmentSource
        return yield* source.read({
          organizationId,
          projectId,
          sessionIds: [session1, session2],
          cutoff,
          sessions: [
            { sessionId: session1, traceIds: [trace1] },
            { sessionId: session2, traceIds: [trace2] },
          ],
        })
      }).pipe(Effect.provide(SessionAssessmentBulkJudgmentSourceLive.pipe(Layer.provideMerge(dependencies)))),
    )

    expect(scoreReads).toBe(1)
    expect(signalReads).toBe(1)
    expect(result).toEqual([
      { sessionId: session1, scores: [], signals: [] },
      { sessionId: session2, scores: [score], signals: [] },
    ])
  })
})

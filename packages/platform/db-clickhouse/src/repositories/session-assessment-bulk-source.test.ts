import { SessionAssessmentBulkTelemetrySource } from "@domain/agent-score"
import {
  SessionAnalysisRepository,
  SessionMomentLabelRepository,
  SessionSemanticMomentRepository,
} from "@domain/conversation-intelligence"
import {
  createFakeSessionAnalysisRepository,
  createFakeSessionMomentLabelRepository,
  createFakeSessionSemanticMomentRepository,
} from "@domain/conversation-intelligence/testing"
import { FlaggerScreeningDecisionRepository } from "@domain/flaggers"
import { createFakeFlaggerScreeningDecisionRepository } from "@domain/flaggers/testing"
import { ChSqlClient, OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { type SessionDetail, SessionRepository, SpanRepository } from "@domain/spans"
import { createFakeSessionRepository, createFakeSpanRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SessionAssessmentBulkTelemetrySourceLive } from "./session-assessment-bulk-source.ts"

const organizationId = OrganizationId("org-1")
const projectId = ProjectId("project-1")
const sessionId = SessionId("session-1")
const traceId = TraceId("trace-1")
const cutoff = new Date("2026-01-02T00:00:00.000Z")
const session = {
  organizationId,
  projectId,
  sessionId,
  traceIds: [traceId],
  outputMessages: [],
} as unknown as SessionDetail

describe("SessionAssessmentBulkTelemetrySourceLive", () => {
  it("loads each ClickHouse source once for the whole batch", async () => {
    const reads = { sessions: 0, spans: 0, analyses: 0, moments: 0, labels: 0, screening: 0 }
    const sessionRepository = createFakeSessionRepository({
      listDetailsBySessionIds: (input) => {
        reads.sessions += 1
        expect(input).toMatchObject({ organizationId, projectId, sessionIds: [sessionId], endTimeTo: cutoff })
        return Effect.succeed([session])
      },
    }).repository
    const spanRepository = createFakeSpanRepository({
      listByTraceIds: (input) => {
        reads.spans += 1
        expect(input).toMatchObject({ traceIds: [traceId], startTimeTo: cutoff })
        return Effect.succeed([])
      },
    }).repository
    const analysisRepository = createFakeSessionAnalysisRepository([], {
      listLatestBySessions: () => {
        reads.analyses += 1
        return Effect.succeed([])
      },
    }).repository
    const baseMoments = createFakeSessionSemanticMomentRepository().repository
    const momentRepository = {
      ...baseMoments,
      listBySessions: (input: Parameters<typeof baseMoments.listBySessions>[0]) => {
        reads.moments += 1
        return baseMoments.listBySessions(input)
      },
    }
    const baseLabels = createFakeSessionMomentLabelRepository().repository
    const labelRepository = {
      ...baseLabels,
      listBySessions: (input: Parameters<typeof baseLabels.listBySessions>[0]) => {
        reads.labels += 1
        return baseLabels.listBySessions(input)
      },
    }
    const screeningRepository = createFakeFlaggerScreeningDecisionRepository([], {
      listLatestBySessions: () => {
        reads.screening += 1
        return Effect.succeed([])
      },
    }).repository
    const dependencies = Layer.mergeAll(
      Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
      Layer.succeed(SessionRepository, sessionRepository),
      Layer.succeed(SpanRepository, spanRepository),
      Layer.succeed(SessionAnalysisRepository, analysisRepository),
      Layer.succeed(SessionSemanticMomentRepository, momentRepository),
      Layer.succeed(SessionMomentLabelRepository, labelRepository),
      Layer.succeed(FlaggerScreeningDecisionRepository, screeningRepository),
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* SessionAssessmentBulkTelemetrySource
        return yield* source.read({ organizationId, projectId, sessionIds: [sessionId], cutoff })
      }).pipe(Effect.provide(SessionAssessmentBulkTelemetrySourceLive.pipe(Layer.provideMerge(dependencies)))),
    )

    expect(reads).toEqual({ sessions: 1, spans: 1, analyses: 1, moments: 1, labels: 1, screening: 1 })
    expect(result).toEqual([{ session, spans: [], moments: { moments: [], labels: [] }, screeningDecisions: [] }])
  })
})

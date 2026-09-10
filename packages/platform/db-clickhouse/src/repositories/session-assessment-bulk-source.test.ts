import { SESSION_ASSESSMENT_CONTENT_BUDGET, SessionAssessmentBulkTelemetrySource } from "@domain/agent-score"
import {
  type SessionAnalysis,
  SessionAnalysisRepository,
  SessionMomentLabelRepository,
  SessionSemanticMomentRepository,
} from "@domain/conversation-intelligence"
import {
  createFakeSessionAnalysisRepository,
  createFakeSessionMomentLabelRepository,
  createFakeSessionSemanticMomentRepository,
} from "@domain/conversation-intelligence/testing"
import { type FlaggerScreeningDecision, FlaggerScreeningDecisionRepository } from "@domain/flaggers"
import { createFakeFlaggerScreeningDecisionRepository } from "@domain/flaggers/testing"
import { type MemoryEvent, MemoryRepository } from "@domain/memories"
import { createFakeMemoryRepository } from "@domain/memories/testing"
import { ChSqlClient, OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import {
  type SessionDetail,
  type SessionGenerationFact,
  SessionRepository,
  type SessionToolCallFact,
  SpanRepository,
} from "@domain/spans"
import { createFakeSessionRepository, createFakeSpanRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SessionAssessmentBulkTelemetrySourceLive } from "./session-assessment-bulk-source.ts"

const organizationId = OrganizationId("org-1")
const projectId = ProjectId("project-1")
const sessionId = SessionId("session-1")
const traceId = TraceId("trace-1")
const cutoff = new Date("2026-01-02T00:00:00.000Z")
const analysisHash = "a".repeat(64)
const session = {
  organizationId,
  projectId,
  sessionId,
  traceIds: [traceId],
  outputMessages: [],
} as unknown as SessionDetail

const analysis = {
  organizationId,
  projectId,
  sessionId,
  startTime: new Date("2026-01-01T00:00:00.000Z"),
  endTime: new Date("2026-01-01T00:01:00.000Z"),
  traceIds: [traceId],
  analysisHash,
  analysisStatus: "analyzed",
  statusReason: "Analyzed",
  retentionDays: 90,
  indexedAt: new Date("2026-01-01T00:02:00.000Z"),
} satisfies SessionAnalysis

const otherSessionId = SessionId("session-2")
const otherTraceId = TraceId("trace-2")
const otherSession = {
  organizationId,
  projectId,
  sessionId: otherSessionId,
  traceIds: [otherTraceId],
  outputMessages: [],
} as unknown as SessionDetail

const generation = (traceId: TraceId, spanId: string) =>
  ({ traceId, spanId, operation: "chat" }) as unknown as SessionGenerationFact
const toolCall = (traceId: TraceId, spanId: string) =>
  ({ traceId, spanId, toolCallId: `call-${spanId}` }) as unknown as SessionToolCallFact
const memoryEvent = (eventSessionId: SessionId, recordId: string) =>
  ({ sessionId: eventSessionId, recordId, changeKind: "read" }) as unknown as MemoryEvent

const decision = (overrides: Partial<FlaggerScreeningDecision> = {}): FlaggerScreeningDecision => ({
  decisionId: "d".repeat(64),
  organizationId,
  projectId,
  sessionId,
  flaggerSlug: "refusal",
  analysisHash,
  scoringArtifactVersion: "flagger-screening-v1",
  attempt: 1,
  version: 1,
  selected: true,
  reason: "hinted",
  inclusionProbability: 1,
  hintKinds: ["pattern:refusal"],
  outcome: "unmatched",
  createdAt: new Date("2026-01-01T00:03:00.000Z"),
  retentionDays: 90,
  ...overrides,
})

describe("SessionAssessmentBulkTelemetrySourceLive", () => {
  it("loads each ClickHouse source once for the whole batch", async () => {
    const reads = {
      sessions: 0,
      spans: 0,
      generations: 0,
      toolCalls: 0,
      memoryEvents: 0,
      analyses: 0,
      moments: 0,
      labels: 0,
      screening: 0,
    }
    const sessionRepository = createFakeSessionRepository({
      listDetailsBySessionIds: (input) => {
        reads.sessions += 1
        expect(input).toMatchObject({ organizationId, projectId, sessionIds: [sessionId], cutoff })
        return Effect.succeed([session])
      },
    }).repository
    const spanRepository = createFakeSpanRepository({
      listByTraceIds: (input) => {
        reads.spans += 1
        expect(input).toMatchObject({ traceIds: [traceId], startTimeTo: cutoff })
        return Effect.succeed([])
      },
      listGenerationFactsByTraceIds: (input) => {
        reads.generations += 1
        expect(input).toMatchObject({ traceIds: [traceId], startTimeTo: cutoff })
        expect(input.contentBudget).toEqual(SESSION_ASSESSMENT_CONTENT_BUDGET)
        expect(input.sessionKeyByTraceId.get(traceId)).toBe(sessionId)
        return Effect.succeed([])
      },
      listToolCallFactsByTraceIds: (input) => {
        reads.toolCalls += 1
        expect(input).toMatchObject({ traceIds: [traceId], startTimeTo: cutoff })
        return Effect.succeed([])
      },
    }).repository
    const memoryRepository = createFakeMemoryRepository({
      readMemoryEventsBySessionIds: (input) => {
        reads.memoryEvents += 1
        expect(input).toMatchObject({ organizationId, projectId, sessionIds: [sessionId], endTimeTo: cutoff })
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
      Layer.succeed(MemoryRepository, memoryRepository),
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* SessionAssessmentBulkTelemetrySource
        return yield* source.read({ organizationId, projectId, sessionIds: [sessionId], cutoff })
      }).pipe(Effect.provide(SessionAssessmentBulkTelemetrySourceLive.pipe(Layer.provideMerge(dependencies)))),
    )

    expect(reads).toEqual({
      sessions: 1,
      spans: 1,
      generations: 1,
      toolCalls: 1,
      memoryEvents: 1,
      analyses: 1,
      moments: 1,
      labels: 1,
      screening: 1,
    })
    expect(result).toEqual([
      {
        session,
        spans: [],
        generations: [],
        toolCalls: [],
        memoryEvents: [],
        moments: { moments: [], labels: [] },
        screeningDecisions: [],
      },
    ])
  })

  it("keys Cost source facts to the session that owns their trace", async () => {
    const dependencies = Layer.mergeAll(
      Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
      Layer.succeed(
        SessionRepository,
        createFakeSessionRepository({ listDetailsBySessionIds: () => Effect.succeed([session, otherSession]) })
          .repository,
      ),
      Layer.succeed(
        SpanRepository,
        createFakeSpanRepository({
          listByTraceIds: () => Effect.succeed([]),
          listGenerationFactsByTraceIds: () =>
            Effect.succeed([generation(traceId, "gen-1"), generation(otherTraceId, "gen-2")]),
          listToolCallFactsByTraceIds: () =>
            Effect.succeed([toolCall(otherTraceId, "tool-1"), toolCall(traceId, "tool-2")]),
        }).repository,
      ),
      Layer.succeed(
        SessionAnalysisRepository,
        createFakeSessionAnalysisRepository([], { listLatestBySessions: () => Effect.succeed([]) }).repository,
      ),
      Layer.succeed(SessionSemanticMomentRepository, createFakeSessionSemanticMomentRepository().repository),
      Layer.succeed(SessionMomentLabelRepository, createFakeSessionMomentLabelRepository().repository),
      Layer.succeed(
        FlaggerScreeningDecisionRepository,
        createFakeFlaggerScreeningDecisionRepository([], { listLatestBySessions: () => Effect.succeed([]) }).repository,
      ),
      Layer.succeed(
        MemoryRepository,
        createFakeMemoryRepository({
          readMemoryEventsBySessionIds: () =>
            Effect.succeed([
              memoryEvent(otherSessionId, "record-1"),
              memoryEvent(sessionId, "record-2"),
              memoryEvent(SessionId("session-outside-batch"), "record-3"),
            ]),
        }).repository,
      ),
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* SessionAssessmentBulkTelemetrySource
        return yield* source.read({
          organizationId,
          projectId,
          sessionIds: [sessionId, otherSessionId],
          cutoff,
        })
      }).pipe(Effect.provide(SessionAssessmentBulkTelemetrySourceLive.pipe(Layer.provideMerge(dependencies)))),
    )

    expect(result.map((facts) => facts.generations.map((fact) => fact.spanId))).toEqual([["gen-1"], ["gen-2"]])
    expect(result.map((facts) => facts.toolCalls.map((fact) => fact.spanId))).toEqual([["tool-2"], ["tool-1"]])
    expect(result.map((facts) => facts.memoryEvents.map((event) => event.recordId))).toEqual([
      ["record-2"],
      ["record-1"],
    ])
  })

  it("attaches screening decisions only from the authoritative analysis generation", async () => {
    const currentDecision = decision({ flaggerSlug: "laziness" })
    const staleDecision = decision({ analysisHash: "b".repeat(64) })
    const dependencies = Layer.mergeAll(
      Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
      Layer.succeed(
        SessionRepository,
        createFakeSessionRepository({ listDetailsBySessionIds: () => Effect.succeed([session]) }).repository,
      ),
      Layer.succeed(SpanRepository, createFakeSpanRepository({ listByTraceIds: () => Effect.succeed([]) }).repository),
      Layer.succeed(
        SessionAnalysisRepository,
        createFakeSessionAnalysisRepository([], { listLatestBySessions: () => Effect.succeed([analysis]) }).repository,
      ),
      Layer.succeed(SessionSemanticMomentRepository, createFakeSessionSemanticMomentRepository().repository),
      Layer.succeed(SessionMomentLabelRepository, createFakeSessionMomentLabelRepository().repository),
      Layer.succeed(
        FlaggerScreeningDecisionRepository,
        createFakeFlaggerScreeningDecisionRepository([], {
          listLatestBySessions: () => Effect.succeed([staleDecision, currentDecision]),
        }).repository,
      ),
      Layer.succeed(MemoryRepository, createFakeMemoryRepository().repository),
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* SessionAssessmentBulkTelemetrySource
        return yield* source.read({ organizationId, projectId, sessionIds: [sessionId], cutoff })
      }).pipe(Effect.provide(SessionAssessmentBulkTelemetrySourceLive.pipe(Layer.provideMerge(dependencies)))),
    )

    expect(result[0]?.screeningDecisions).toEqual([currentDecision])
  })
})

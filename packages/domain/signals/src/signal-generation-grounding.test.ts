import {
  ChSqlClient,
  ExternalUserId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SessionId,
  SpanId,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import {
  MessageEmbeddingRepository,
  type Session,
  SessionRepository,
  SpanRepository,
  type TraceDetail,
  TraceRepository,
  type TraceTimeHistogramBucket,
} from "@domain/spans"
import {
  createFakeMessageEmbeddingRepository,
  createFakeSessionRepository,
  createFakeSpanRepository,
  createFakeTraceRepository,
} from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { assembleSignalGenerationGrounding } from "./signal-generation-grounding.ts"

const organizationId = "o".repeat(24)
const projectId = "p".repeat(24)
const traceId = TraceId("a".repeat(32))
const sessionId = SessionId("session-1")

const traceDetail: TraceDetail = {
  organizationId: OrganizationId(organizationId),
  projectId: ProjectId(projectId),
  traceId,
  spanCount: 2,
  errorCount: 0,
  startTime: new Date("2026-01-01T00:00:00.000Z"),
  endTime: new Date("2026-01-01T00:00:01.000Z"),
  durationNs: 1_000_000_000,
  timeToFirstTokenNs: 0,
  tokensInput: 120,
  tokensOutput: 80,
  tokensCacheRead: 0,
  tokensCacheCreate: 0,
  tokensReasoning: 0,
  tokensTotal: 200,
  costInputMicrocents: 50,
  costOutputMicrocents: 25,
  costTotalMicrocents: 75,
  sessionId,
  userId: ExternalUserId("user"),
  userEmail: "",
  simulationId: "",
  tags: [],
  metadata: {},
  models: ["gpt-4o-mini"],
  providers: ["openai"],
  serviceNames: ["web"],
  agentNames: [],
  rootSpanId: SpanId("r".repeat(16)),
  rootSpanName: "root",
  systemInstructions: [],
  inputMessages: [],
  outputMessages: [],
  allMessages: [
    { role: "user", parts: [{ type: "text", content: "cancel my ticket" }] },
    { role: "assistant", parts: [{ type: "text", content: "done" }] },
  ],
}

const histogramBucket: TraceTimeHistogramBucket = {
  bucketStart: "2026-01-01T00:00:00.000Z",
  traceCount: 1200,
  sessionCount: 1000,
  costTotalMicrocentsSum: 0,
  durationNsMedian: 0,
  tokensTotalSum: 0,
  spanCountSum: 0,
  timeToFirstTokenNsMedian: 0,
  tokensInputSum: 0,
  tokensCacheReadSum: 0,
  tokensCacheCreateSum: 0,
}

const buildLayer = (options: { hasSessions: boolean }) => {
  const { repository: traceRepository } = createFakeTraceRepository({
    findByTraceId: () => Effect.succeed(traceDetail),
    distinctFilterValues: ({ column }) =>
      Effect.succeed(column === "tools" || column === "definedTools" ? ["cancel_ticket", "search_flights"] : ["web"]),
    histogramByProjectId: () => Effect.succeed([histogramBucket]),
  })
  const { repository: sessionRepository } = createFakeSessionRepository({
    findBySessionId: () => Effect.fail(new NotFoundError({ entity: "Session", id: String(sessionId) })),
    histogramByProjectId: () => Effect.succeed([histogramBucket]),
    listByProjectId: () =>
      Effect.succeed({
        items: options.hasSessions ? [{ sessionId, traceIds: [traceId] } as unknown as Session] : [],
        hasMore: false,
      }),
  })
  const { repository: spanRepository } = createFakeSpanRepository({
    listBySessionId: () => Effect.succeed([]),
    listToolSpansBySessionId: () => Effect.succeed([]),
  })

  return Layer.mergeAll(
    Layer.succeed(TraceRepository, traceRepository),
    Layer.succeed(SessionRepository, sessionRepository),
    Layer.succeed(SpanRepository, spanRepository),
    Layer.succeed(MessageEmbeddingRepository, createFakeMessageEmbeddingRepository().repository),
    Layer.succeed(ChSqlClient, createFakeChSqlClient()),
  )
}

describe("assembleSignalGenerationGrounding", () => {
  it("collects distinct values, traffic, and a sample session", async () => {
    const result = await Effect.runPromise(
      assembleSignalGenerationGrounding({ organizationId, projectId }).pipe(
        Effect.provide(buildLayer({ hasSessions: true })),
      ),
    )

    expect(result.hasSessions).toBe(true)
    expect(result.grounding.tools).toEqual(["cancel_ticket", "search_flights"])
    expect(result.grounding.avgSessionsPerDay).toBe(1000)
    expect(result.grounding.sampleSession).toContain("tools invoked")
  })

  it("reports no sessions and a null sample when the project is empty", async () => {
    const result = await Effect.runPromise(
      assembleSignalGenerationGrounding({ organizationId, projectId }).pipe(
        Effect.provide(buildLayer({ hasSessions: false })),
      ),
    )

    expect(result.hasSessions).toBe(false)
    expect(result.grounding.sampleSession).toBeNull()
  })
})

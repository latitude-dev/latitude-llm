import { OutboxEventWriter } from "@domain/events"
import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import {
  ChSqlClient,
  ExternalUserId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import type { Span, TraceDetail } from "@domain/spans"
import { SpanRepository, TraceRepository } from "@domain/spans"
import { createFakeSpanRepository, createFakeTraceRepository, stubListSpan } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import type { GenAIMessage } from "rosetta-ai"

export const cuid = "a".repeat(24)
export const projectCuid = "b".repeat(24)
export const traceIdRaw = "d".repeat(32)
const traceId = TraceId(traceIdRaw)
export const defaultResolvedSpanId = SpanId("s".repeat(16))
export const queueId = "q".repeat(24)

function defaultCompletionSpan(): Span {
  return stubListSpan({
    organizationId: OrganizationId(cuid),
    projectId: ProjectId(projectCuid),
    traceId,
    sessionId: SessionId("session"),
    spanId: defaultResolvedSpanId,
    operation: "chat",
    startTime: new Date("2026-03-24T00:00:00.000Z"),
    endTime: new Date("2026-03-24T00:01:00.000Z"),
  })
}

export function makeTraceDetail(allMessages: readonly GenAIMessage[]): TraceDetail {
  return {
    organizationId: OrganizationId(cuid),
    projectId: ProjectId(projectCuid),
    traceId,
    spanCount: 1,
    errorCount: 0,
    startTime: new Date("2026-03-24T00:00:00.000Z"),
    endTime: new Date("2026-03-24T00:00:00.000Z"),
    durationNs: 0,
    timeToFirstTokenNs: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 0,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: 0,
    sessionId: SessionId("session"),
    userId: ExternalUserId("user"),
    simulationId: SimulationId(""),
    tags: [],
    metadata: {},
    models: [],
    providers: [],
    serviceNames: [],
    rootSpanId: SpanId("r".repeat(16)),
    rootSpanName: "root",
    systemInstructions: [],
    inputMessages: [],
    outputMessages: [],
    allMessages: [...allMessages],
  }
}

export function createTestLayers(options?: { traceDetail?: TraceDetail | null; spansForTrace?: readonly Span[] }) {
  const events: unknown[] = []
  const { repository: scoreRepository, scores: store } = createFakeScoreRepository()
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository()

  const traceDetailForLookup =
    options === undefined || options.traceDetail === undefined ? makeTraceDetail([]) : options.traceDetail

  const { repository: traceRepository } = createFakeTraceRepository({
    findByTraceId: () => {
      if (traceDetailForLookup === null) {
        return Effect.fail(new NotFoundError({ entity: "Trace", id: "" }))
      }
      return Effect.succeed(traceDetailForLookup)
    },
  })

  const spans = options?.spansForTrace ?? [defaultCompletionSpan()]
  const { repository: spanRepository } = createFakeSpanRepository({
    listByTraceId: () => Effect.succeed([...spans]),
  })

  const ScoreRepositoryTest = Layer.succeed(ScoreRepository, scoreRepository)
  const ScoreAnalyticsRepositoryTest = Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository)

  const OutboxEventWriterTest = Layer.succeed(OutboxEventWriter, {
    write: (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
  })

  const SqlClientTest = Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(cuid) }))
  const ChSqlClientTest = Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(cuid) }))

  const TraceRepositoryTest = Layer.succeed(TraceRepository, traceRepository)
  const SpanRepositoryTest = Layer.succeed(SpanRepository, spanRepository)

  return {
    store,
    events,
    layer: Layer.mergeAll(
      ScoreRepositoryTest,
      ScoreAnalyticsRepositoryTest,
      OutboxEventWriterTest,
      SqlClientTest,
      ChSqlClientTest,
      TraceRepositoryTest,
      SpanRepositoryTest,
    ),
  }
}

import { OutboxEventWriter } from "@domain/events"
import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import {
  ChSqlClient,
  ExternalUserId,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import type { TraceDetail } from "@domain/spans"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { runDeterministicSystemMatchersUseCase } from "./run-deterministic-system-matchers.ts"

const ORG_ID = OrganizationId("a".repeat(24))
const PROJECT_ID = ProjectId("b".repeat(24))
const TRACE_ID = TraceId("c".repeat(32))

function createTestLayers() {
  const events: Array<{ readonly eventName: string; readonly payload: unknown }> = []
  const { repository: scoreRepository, scores: store } = createFakeScoreRepository()
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository()

  const layer = Layer.mergeAll(
    Layer.succeed(ScoreRepository, scoreRepository),
    Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
    Layer.succeed(OutboxEventWriter, {
      write: (event) =>
        Effect.sync(() => {
          events.push({ eventName: event.eventName, payload: event.payload })
        }),
    }),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: ORG_ID })),
  )

  return { store, events, layer }
}

function makeTraceDetail(overrides?: Partial<TraceDetail>): TraceDetail {
  return {
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    traceId: TRACE_ID,
    spanCount: 2,
    errorCount: 0,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
    durationNs: 1_000_000,
    timeToFirstTokenNs: 0,
    tokensInput: 10,
    tokensOutput: 5,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 15,
    costInputMicrocents: 10,
    costOutputMicrocents: 5,
    costTotalMicrocents: 15,
    sessionId: SessionId("session-1"),
    userId: ExternalUserId("user-1"),
    simulationId: SimulationId(""),
    tags: [],
    metadata: {},
    models: ["gpt-4o-mini"],
    providers: ["openai"],
    serviceNames: ["web"],
    rootSpanId: SpanId("r".repeat(16)),
    rootSpanName: "root",
    systemInstructions: [],
    inputMessages: [],
    outputMessages: [],
    allMessages: [],
    ...overrides,
  }
}

describe("runDeterministicSystemMatchersUseCase", () => {
  it("returns no matches and writes no scores when the trace is healthy", async () => {
    const { store, events, layer } = createTestLayers()

    const trace = makeTraceDetail({
      allMessages: [
        {
          role: "user",
          parts: [{ type: "text", content: "hi" }],
        },
        {
          role: "assistant",
          parts: [{ type: "text", content: "Hello, how can I help?" }],
        },
      ],
      outputMessages: [
        {
          role: "assistant",
          parts: [{ type: "text", content: "Hello, how can I help?" }],
        },
      ],
    })

    const result = await Effect.runPromise(runDeterministicSystemMatchersUseCase({ trace }).pipe(Effect.provide(layer)))

    expect(result).toEqual({ matchedSlugs: [] })
    expect(store.size).toBe(0)
    expect(events).toHaveLength(0)
  })

  it("writes a published annotation score with SYSTEM sourceId for tool-call-errors", async () => {
    const { store, events, layer } = createTestLayers()

    const trace = makeTraceDetail({
      allMessages: [
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-weather", name: "get_weather", arguments: { city: "BCN" } }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-weather", response: { ok: false, error: "timeout" } }],
        },
      ],
    })

    const result = await Effect.runPromise(runDeterministicSystemMatchersUseCase({ trace }).pipe(Effect.provide(layer)))

    expect(result).toEqual({ matchedSlugs: ["tool-call-errors"] })
    expect(store.size).toBe(1)

    const [score] = [...store.values()]
    expect(score.source).toBe("annotation")
    expect(score.sourceId).toBe("SYSTEM")
    expect(score.draftedAt).toBeNull()
    expect(score.annotatorId).toBeNull()
    expect(score.passed).toBe(false)
    expect(score.value).toBe(0)
    expect(score.feedback).toBe('Tool "get_weather" returned error: timeout')
    if (score.source === "annotation") {
      expect(score.metadata.rawFeedback).toBe('Tool "get_weather" returned error: timeout')
    }

    expect(events).toHaveLength(1)
    expect(events[0].eventName).toBe("ScoreCreated")
    expect(events[0].payload).toMatchObject({ status: "published" })
  })

  it("writes multiple scores when several matchers fire for the same trace", async () => {
    const { store, events, layer } = createTestLayers()

    const trace = makeTraceDetail({
      allMessages: [
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-weather", name: "get_weather", arguments: { city: "BCN" } }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-weather", response: { ok: false, error: "timeout" } }],
        },
      ],
      outputMessages: [
        {
          role: "assistant",
          parts: [{ type: "text", content: "" }],
        },
      ],
    })

    const result = await Effect.runPromise(runDeterministicSystemMatchersUseCase({ trace }).pipe(Effect.provide(layer)))

    expect(result).toEqual({ matchedSlugs: ["tool-call-errors", "empty-response"] })
    expect(store.size).toBe(2)
    expect(events).toHaveLength(2)
    for (const event of events) {
      expect(event.eventName).toBe("ScoreCreated")
      expect(event.payload).toMatchObject({ status: "published" })
    }
  })

  it("coerces empty simulationId sentinel to null on the written score", async () => {
    const { store, layer } = createTestLayers()

    const trace = makeTraceDetail({
      simulationId: SimulationId(""),
      outputMessages: [
        {
          role: "assistant",
          parts: [{ type: "text", content: "" }],
        },
      ],
    })

    await Effect.runPromise(runDeterministicSystemMatchersUseCase({ trace }).pipe(Effect.provide(layer)))

    const [score] = [...store.values()]
    expect(score.simulationId).toBeNull()
  })
})

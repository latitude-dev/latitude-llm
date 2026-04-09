import { ExternalUserId, OrganizationId, ProjectId, SessionId, SimulationId, SpanId, TraceId } from "@domain/shared"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { runSystemQueueFlaggerUseCase } from "./run-system-queue-flagger.ts"

const INPUT = {
  organizationId: "a".repeat(24),
  projectId: "b".repeat(24),
  traceId: "c".repeat(32),
} as const

function makeTraceDetail(
  allMessages: TraceDetail["allMessages"],
  outputMessages?: TraceDetail["outputMessages"],
): TraceDetail {
  return {
    organizationId: OrganizationId(INPUT.organizationId),
    projectId: ProjectId(INPUT.projectId),
    traceId: TraceId(INPUT.traceId),
    spanCount: 1,
    errorCount: 0,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
    durationNs: 1,
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
    outputMessages: outputMessages ?? allMessages,
    allMessages,
  }
}

describe("runSystemQueueFlaggerUseCase", () => {
  it("matches tool-call-errors from conversation history", async () => {
    const { repository } = createFakeTraceRepository({
      findByTraceId: () =>
        Effect.succeed(
          makeTraceDetail([
            {
              role: "assistant",
              parts: [{ type: "tool_call", id: "call-weather", name: "get_weather", arguments: { city: "BCN" } }],
            },
            {
              role: "tool",
              parts: [{ type: "tool_call_response", id: "call-weather", response: "timeout error" }],
            },
          ]),
        ),
    })

    const result = await Effect.runPromise(
      runSystemQueueFlaggerUseCase({ ...INPUT, queueSlug: "tool-call-errors" }).pipe(
        Effect.provide(Layer.succeed(TraceRepository, repository)),
      ),
    )

    expect(result).toEqual({ matched: true })
  })

  it("returns false for resource-outliers via noop matcher", async () => {
    const { repository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail([])),
    })

    const result = await Effect.runPromise(
      runSystemQueueFlaggerUseCase({ ...INPUT, queueSlug: "resource-outliers" }).pipe(
        Effect.provide(Layer.succeed(TraceRepository, repository)),
      ),
    )

    expect(result).toEqual({ matched: false })
  })
})

describe("output-schema-validation flagger", () => {
  it("matches truncated JSON object (content like '{name: John, age: ')", async () => {
    const outputMessages: TraceDetail["outputMessages"] = [
      {
        role: "assistant",
        parts: [{ type: "text", content: '{"name": "John", "age": ' }],
      },
    ]
    const { repository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail([], outputMessages)),
    })

    const result = await Effect.runPromise(
      runSystemQueueFlaggerUseCase({ ...INPUT, queueSlug: "output-schema-validation" }).pipe(
        Effect.provide(Layer.succeed(TraceRepository, repository)),
      ),
    )

    expect(result).toEqual({ matched: true })
  })

  it("matches malformed JSON (content like '{name: John, invalid}')", async () => {
    const outputMessages: TraceDetail["outputMessages"] = [
      {
        role: "assistant",
        parts: [{ type: "text", content: '{"name": "John", invalid}' }],
      },
    ]
    const { repository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail([], outputMessages)),
    })

    const result = await Effect.runPromise(
      runSystemQueueFlaggerUseCase({ ...INPUT, queueSlug: "output-schema-validation" }).pipe(
        Effect.provide(Layer.succeed(TraceRepository, repository)),
      ),
    )

    expect(result).toEqual({ matched: true })
  })

  it("does NOT match valid JSON", async () => {
    const outputMessages: TraceDetail["outputMessages"] = [
      {
        role: "assistant",
        parts: [{ type: "text", content: '{"name": "John", "age": 30}' }],
      },
    ]
    const { repository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail([], outputMessages)),
    })

    const result = await Effect.runPromise(
      runSystemQueueFlaggerUseCase({ ...INPUT, queueSlug: "output-schema-validation" }).pipe(
        Effect.provide(Layer.succeed(TraceRepository, repository)),
      ),
    )

    expect(result).toEqual({ matched: false })
  })

  it("does NOT match non-JSON text responses", async () => {
    const outputMessages: TraceDetail["outputMessages"] = [
      {
        role: "assistant",
        parts: [{ type: "text", content: "I'll help you with that!" }],
      },
    ]
    const { repository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail([], outputMessages)),
    })

    const result = await Effect.runPromise(
      runSystemQueueFlaggerUseCase({ ...INPUT, queueSlug: "output-schema-validation" }).pipe(
        Effect.provide(Layer.succeed(TraceRepository, repository)),
      ),
    )

    expect(result).toEqual({ matched: false })
  })

  it("matches JSON ending with comma (truncation indicator)", async () => {
    const outputMessages: TraceDetail["outputMessages"] = [
      {
        role: "assistant",
        parts: [{ type: "text", content: '{"name": "John", "age": 30, "city": "NYC",}' }],
      },
    ]
    const { repository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail([], outputMessages)),
    })

    const result = await Effect.runPromise(
      runSystemQueueFlaggerUseCase({ ...INPUT, queueSlug: "output-schema-validation" }).pipe(
        Effect.provide(Layer.succeed(TraceRepository, repository)),
      ),
    )

    expect(result).toEqual({ matched: true })
  })
})

describe("empty-response flagger", () => {
  it("matches empty text response ('')", async () => {
    const outputMessages: TraceDetail["outputMessages"] = [
      {
        role: "assistant",
        parts: [{ type: "text", content: "" }],
      },
    ]
    const { repository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail([], outputMessages)),
    })

    const result = await Effect.runPromise(
      runSystemQueueFlaggerUseCase({ ...INPUT, queueSlug: "empty-response" }).pipe(
        Effect.provide(Layer.succeed(TraceRepository, repository)),
      ),
    )

    expect(result).toEqual({ matched: true })
  })

  it("matches whitespace-only response ('   \\n\\t  ')", async () => {
    const outputMessages: TraceDetail["outputMessages"] = [
      {
        role: "assistant",
        parts: [{ type: "text", content: "   \n\t  " }],
      },
    ]
    const { repository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail([], outputMessages)),
    })

    const result = await Effect.runPromise(
      runSystemQueueFlaggerUseCase({ ...INPUT, queueSlug: "empty-response" }).pipe(
        Effect.provide(Layer.succeed(TraceRepository, repository)),
      ),
    )

    expect(result).toEqual({ matched: true })
  })

  it("matches repeated character pattern (degenerate like '......' or 'aaa')", async () => {
    const outputMessages: TraceDetail["outputMessages"] = [
      {
        role: "assistant",
        parts: [{ type: "text", content: "......" }],
      },
    ]
    const { repository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail([], outputMessages)),
    })

    const result = await Effect.runPromise(
      runSystemQueueFlaggerUseCase({ ...INPUT, queueSlug: "empty-response" }).pipe(
        Effect.provide(Layer.succeed(TraceRepository, repository)),
      ),
    )

    expect(result).toEqual({ matched: true })
  })

  it("does NOT match tool-call-only responses (assistant with only tool_call, no text)", async () => {
    const outputMessages: TraceDetail["outputMessages"] = [
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "call-1", name: "get_weather", arguments: { city: "BCN" } }],
      },
    ]
    const { repository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail([], outputMessages)),
    })

    const result = await Effect.runPromise(
      runSystemQueueFlaggerUseCase({ ...INPUT, queueSlug: "empty-response" }).pipe(
        Effect.provide(Layer.succeed(TraceRepository, repository)),
      ),
    )

    expect(result).toEqual({ matched: false })
  })

  it("does NOT match meaningful text responses ('I'll help you with that!')", async () => {
    const outputMessages: TraceDetail["outputMessages"] = [
      {
        role: "assistant",
        parts: [{ type: "text", content: "I'll help you with that!" }],
      },
    ]
    const { repository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail([], outputMessages)),
    })

    const result = await Effect.runPromise(
      runSystemQueueFlaggerUseCase({ ...INPUT, queueSlug: "empty-response" }).pipe(
        Effect.provide(Layer.succeed(TraceRepository, repository)),
      ),
    )

    expect(result).toEqual({ matched: false })
  })

  it("matches when assistant has both tool calls AND empty text", async () => {
    const outputMessages: TraceDetail["outputMessages"] = [
      {
        role: "assistant",
        parts: [
          { type: "text", content: "" },
          { type: "tool_call", id: "call-1", name: "get_weather", arguments: { city: "BCN" } },
        ],
      },
    ]
    const { repository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail([], outputMessages)),
    })

    const result = await Effect.runPromise(
      runSystemQueueFlaggerUseCase({ ...INPUT, queueSlug: "empty-response" }).pipe(
        Effect.provide(Layer.succeed(TraceRepository, repository)),
      ),
    )

    expect(result).toEqual({ matched: true })
  })
})

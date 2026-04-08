import { ExternalUserId, OrganizationId, ProjectId, SessionId, SimulationId, SpanId, TraceId } from "@domain/shared"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { RESOURCE_OUTLIERS_SYSTEM_QUEUE_SLUG, TOOL_CALL_ERRORS_SYSTEM_QUEUE_SLUG } from "../constants.ts"
import { runSystemQueueFlaggerUseCase } from "./run-system-queue-flagger.ts"

const INPUT = {
  organizationId: "a".repeat(24),
  projectId: "b".repeat(24),
  traceId: "c".repeat(32),
} as const

function makeTraceDetail(allMessages: TraceDetail["allMessages"]): TraceDetail {
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
    outputMessages: [],
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
      runSystemQueueFlaggerUseCase({ ...INPUT, queueSlug: TOOL_CALL_ERRORS_SYSTEM_QUEUE_SLUG }).pipe(
        Effect.provide(Layer.succeed(TraceRepository, repository)),
      ),
    )

    expect(result).toEqual({ matched: true })
  })

  it("returns false for deferred resource-outliers without reading the trace", async () => {
    const { repository } = createFakeTraceRepository({
      findByTraceId: () => Effect.die("resource-outliers should not read traces yet"),
    })

    const result = await Effect.runPromise(
      runSystemQueueFlaggerUseCase({ ...INPUT, queueSlug: RESOURCE_OUTLIERS_SYSTEM_QUEUE_SLUG }).pipe(
        Effect.provide(Layer.succeed(TraceRepository, repository)),
      ),
    )

    expect(result).toEqual({ matched: false })
  })
})

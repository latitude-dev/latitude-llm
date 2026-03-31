import {
  ExternalUserId,
  type OrganizationId,
  type ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  TraceId,
} from "@domain/shared"
import type { TraceDetail } from "@domain/spans"
import { TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"

/**
 * Trace id recognized by {@link apiTestTraceRepositoryLayer} for anchor / trace-detail
 * integration checks in API tests (no real ClickHouse).
 */
export const API_TEST_ANCHOR_TRACE_ID = "22222222222222222222222222222222" as const

const anchorTraceId = TraceId(API_TEST_ANCHOR_TRACE_ID)

const integrationTestAnchorMessages: TraceDetail["allMessages"] = [
  { role: "user", parts: [{ type: "text", content: "hello" }] },
  { role: "assistant", parts: [{ type: "text", content: "mid" }] },
  {
    role: "assistant",
    parts: [{ type: "text", content: "01234567890123456789012345" }],
  },
]

function traceDetailBase(input: {
  organizationId: OrganizationId
  projectId: ProjectId
  traceId: TraceId
  allMessages: TraceDetail["allMessages"]
}): TraceDetail {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    traceId: input.traceId,
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
    allMessages: input.allMessages,
  }
}

const { repository: apiTestTraceRepository } = createFakeTraceRepository({
  findByTraceId: (input) => {
    const allMessages = input.traceId === anchorTraceId ? integrationTestAnchorMessages : []
    return Effect.succeed(
      traceDetailBase({
        organizationId: input.organizationId,
        projectId: input.projectId,
        traceId: input.traceId,
        allMessages,
      }),
    )
  },
})

export const apiTestTraceRepositoryLayer = Layer.succeed(TraceRepository, apiTestTraceRepository)

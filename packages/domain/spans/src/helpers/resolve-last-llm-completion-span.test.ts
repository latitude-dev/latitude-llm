import { ExternalUserId, OrganizationId, ProjectId, SessionId, SimulationId, SpanId, TraceId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import type { Span } from "../entities/span.ts"
import { isLlmCompletionOperation, resolveLastLlmCompletionSpanId } from "./resolve-last-llm-completion-span.ts"

const org = OrganizationId("o".repeat(24))
const proj = ProjectId("p".repeat(24))
const trace = TraceId("t".repeat(32))
const session = SessionId("session")

function baseSpan(overrides: Partial<Span> & Pick<Span, "spanId" | "operation" | "startTime" | "endTime">): Span {
  return {
    organizationId: org,
    projectId: proj,
    sessionId: session,
    userId: ExternalUserId("user"),
    traceId: trace,
    parentSpanId: "",
    apiKeyId: "",
    simulationId: SimulationId(""),
    name: "n",
    serviceName: "s",
    kind: "internal",
    statusCode: "ok",
    statusMessage: "",
    traceFlags: 0,
    traceState: "",
    errorType: "",
    tags: [],
    metadata: {},
    eventsJson: "",
    linksJson: "",
    provider: "",
    model: "",
    responseModel: "",
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: 0,
    costIsEstimated: false,
    timeToFirstTokenNs: 0,
    isStreaming: false,
    responseId: "",
    finishReasons: [],
    attrString: {},
    attrInt: {},
    attrFloat: {},
    attrBool: {},
    resourceString: {},
    scopeName: "",
    scopeVersion: "",
    ingestedAt: new Date(0),
    ...overrides,
  }
}

describe("isLlmCompletionOperation", () => {
  it("accepts chat and text_completion", () => {
    expect(isLlmCompletionOperation("chat")).toBe(true)
    expect(isLlmCompletionOperation("text_completion")).toBe(true)
    expect(isLlmCompletionOperation("execute_tool")).toBe(false)
  })
})

describe("resolveLastLlmCompletionSpanId", () => {
  it("returns undefined when there are no LLM spans", () => {
    expect(
      resolveLastLlmCompletionSpanId([
        baseSpan({
          spanId: SpanId("a".repeat(16)),
          operation: "execute_tool",
          startTime: new Date(1),
          endTime: new Date(2),
        }),
      ]),
    ).toBeUndefined()
  })

  it("picks the span with the latest endTime", () => {
    const older = baseSpan({
      spanId: SpanId("a".repeat(16)),
      operation: "chat",
      startTime: new Date("2026-01-01T00:00:00Z"),
      endTime: new Date("2026-01-01T00:00:01Z"),
    })
    const newer = baseSpan({
      spanId: SpanId("b".repeat(16)),
      operation: "chat",
      startTime: new Date("2026-01-01T00:00:02Z"),
      endTime: new Date("2026-01-01T00:00:05Z"),
    })
    expect(resolveLastLlmCompletionSpanId([older, newer])).toBe(newer.spanId)
  })

  it("treats text_completion like chat", () => {
    const s = baseSpan({
      spanId: SpanId("c".repeat(16)),
      operation: "text_completion",
      startTime: new Date(0),
      endTime: new Date(1),
    })
    expect(resolveLastLlmCompletionSpanId([s])).toBe(s.spanId)
  })
})

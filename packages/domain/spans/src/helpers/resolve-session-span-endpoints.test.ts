import { OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import { stubListSpan } from "@domain/spans/testing"
import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import type { Span } from "../entities/span.ts"
import { sessionSpanEndpointResolutionSchema } from "../entities/span-endpoint.ts"
import { resolveSessionSpanEndpoints } from "./resolve-session-span-endpoints.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const sessionId = SessionId("session")
const traceId = TraceId("t".repeat(32))

const assistantMessage = (parts: unknown[]): GenAIMessage => ({ role: "assistant", parts }) as GenAIMessage

const span = (id: string, startMs: number, endMs: number, overrides: Partial<Span> = {}): Span => ({
  ...stubListSpan({
    organizationId,
    projectId,
    sessionId,
    traceId,
    spanId: SpanId(id.repeat(16)),
    operation: "chat",
    startTime: new Date(startMs),
    endTime: new Date(endMs),
  }),
  provider: "openai",
  finishReasons: ["stop"],
  ...overrides,
})

describe("resolveSessionSpanEndpoints", () => {
  it("resolves recovery and positions from full-session chronology", () => {
    const failed = span("a", 0, 10, {
      errorType: "RateLimitError",
      finishReasons: [],
      costTotalMicrocents: 125,
      statusCode: "error",
    })
    const tool = span("b", 11, 12, { operation: "execute_tool" })
    const successful = span("c", 13, 20, { provider: "anthropic" })

    const resolution = resolveSessionSpanEndpoints({
      spans: [successful, tool, failed],
      outputMessages: [assistantMessage([{ type: "text", content: "done" }])],
    })

    expect(() => sessionSpanEndpointResolutionSchema.parse(resolution)).not.toThrow()
    expect(resolution.generationEndpoints).toMatchObject([
      { spanId: failed.spanId, spanIndex: 0, generationIndex: 0, generationPosition: "intermediate" },
      { spanId: successful.spanId, spanIndex: 2, generationIndex: 1, generationPosition: "final" },
    ])
    expect(resolution.providerErrorFindings).toEqual([
      {
        traceId,
        spanId: failed.spanId,
        generationPosition: "intermediate",
        provider: "openai",
        model: "",
        error: {
          rawValue: "RateLimitError",
          normalizedValue: "rate_limit_error",
          classification: "providerError",
          kind: "rateLimit",
        },
        recovered: true,
        sameSubjectRecovered: false,
        terminal: false,
        failedSpanIndex: 0,
        successfulSpanIndex: 2,
        costTotalMicrocents: 125,
        observedDurationNs: 10_000_000,
      },
    ])
  })

  it("separates same-provider success from a usable completion", () => {
    const failed = span("a", 0, 10, { errorType: "overloaded_error", finishReasons: [], statusCode: "error" })
    const successful = span("b", 11, 20)

    const resolution = resolveSessionSpanEndpoints({
      spans: [failed, successful],
      outputMessages: [assistantMessage([{ type: "reasoning", content: "unfinished" }])],
    })

    expect(resolution.providerErrorFindings[0]).toMatchObject({
      recovered: false,
      sameSubjectRecovered: true,
      terminal: true,
      failedSpanIndex: 0,
      successfulSpanIndex: 1,
      sameSubjectSuccessfulSpanIndex: 1,
    })
  })

  it("does not treat an overlapping generation as a later retry", () => {
    const failed = span("a", 0, 20, { errorType: "server_error", finishReasons: [], statusCode: "error" })
    const overlapping = span("b", 10, 30)

    const resolution = resolveSessionSpanEndpoints({
      spans: [failed, overlapping],
      outputMessages: [assistantMessage([{ type: "text", content: "done" }])],
    })

    expect(resolution.providerErrorFindings[0]).toMatchObject({
      recovered: false,
      sameSubjectRecovered: false,
      terminal: true,
    })
    expect(resolution.providerErrorFindings[0]).not.toHaveProperty("successfulSpanIndex")
  })

  it("marks a final provider failure terminal when no later generation succeeds", () => {
    const failed = span("a", 0, 10, {
      errorType: "permission_denied",
      finishReasons: [],
      statusCode: "error",
    })

    const resolution = resolveSessionSpanEndpoints({
      spans: [failed],
      outputMessages: [assistantMessage([{ type: "tool_call", name: "search" }])],
    })

    expect(resolution.providerErrorFindings[0]).toMatchObject({
      generationPosition: "final",
      recovered: false,
      terminal: true,
    })
  })

  it("uses stable identity tie-breakers for the final generation", () => {
    const firstByIdentity = span("a", 0, 10)
    const secondByIdentity = span("b", 0, 10)

    const resolution = resolveSessionSpanEndpoints({
      spans: [firstByIdentity, secondByIdentity],
      outputMessages: [],
    })

    expect(resolution.generationEndpoints).toMatchObject([
      { spanId: secondByIdentity.spanId, generationPosition: "intermediate" },
      { spanId: firstByIdentity.spanId, generationPosition: "final" },
    ])
  })

  it("keeps unmapped endpoint values visible without promoting them to findings or success", () => {
    const failed = span("a", 0, 10, {
      errorType: "FutureProviderError",
      finishReasons: ["FUTURE_REASON"],
      statusCode: "error",
    })
    const recognized = span("b", 11, 20, {
      errorType: "api_timeout_error",
      finishReasons: [],
      statusCode: "error",
    })
    const unknownLater = span("c", 21, 30, { finishReasons: ["FUTURE_REASON"] })

    const resolution = resolveSessionSpanEndpoints({
      spans: [failed, recognized, unknownLater],
      outputMessages: [assistantMessage([{ type: "text", content: "done" }])],
    })

    expect(resolution.generationEndpoints[0]?.providerError?.classification).toBe("unmapped")
    expect(resolution.providerErrorFindings).toHaveLength(1)
    expect(resolution.providerErrorFindings[0]).toMatchObject({
      spanId: recognized.spanId,
      recovered: false,
      terminal: true,
    })
  })
})

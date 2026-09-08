import { OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import type { SessionDetail, Span } from "@domain/spans"
import { stubListSpan } from "@domain/spans/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { readSessionAssessmentSources } from "./read-session-assessment-sources.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const sessionId = SessionId("session-1")
const traceId = TraceId("t".repeat(32))

const session = (outputMessages: SessionDetail["outputMessages"]): SessionDetail =>
  ({
    organizationId,
    projectId,
    sessionId,
    traceIds: [traceId],
    systemInstructions: [],
    lastInputMessages: [{ role: "user", parts: [{ type: "text", content: "Help" }] }],
    inputMessages: [],
    outputMessages,
    tags: [],
    definedTools: [],
    tokensInput: 10,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    costTotalMicrocents: 12,
    durationNs: 24,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
  }) as unknown as SessionDetail

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

const read = (value: SessionDetail, spans: readonly Span[] = []) =>
  Effect.runPromise(
    readSessionAssessmentSources({
      session: value,
      spans,
      scores: [],
      signals: [],
      moments: { moments: [], labels: [] },
      screeningDecisions: [],
    }),
  )

describe("readSessionAssessmentSources", () => {
  it("normalizes blank delivered output as deterministic no-output evidence", async () => {
    const result = await read(session([{ role: "assistant", parts: [{ type: "text", content: "  " }] }]))

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "noOutput", metricId: "sessions.no_output", findingKind: "blank" }),
      ]),
    )
    expect(result.findings.some((finding) => finding.kind === "usableCompletion")).toBe(false)
    expect(result.readers.find((reader) => reader.readerId === "sessions.no_output")).toMatchObject({
      applicable: true,
      findingCount: 1,
      readableCount: 1,
    })
  })

  it("treats a tool call as delivered output without running a classifier", async () => {
    const result = await read(
      session([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-1", name: "search", arguments: { query: "latitude" } }],
        },
      ]),
    )

    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "usableCompletion" })]))
    expect(result.findings.some((finding) => finding.kind === "noOutput")).toBe(false)
  })

  it("preserves provider recovery meanings and stable evidence identity", async () => {
    const failed = span("a", 0, 10, {
      errorType: "RateLimitError",
      finishReasons: [],
      statusCode: "error",
    })
    const successful = span("b", 11, 20, { provider: "anthropic" })
    const value = session([{ role: "assistant", parts: [{ type: "text", content: "Recovered answer" }] }])

    const first = await read(value, [successful, failed])
    const second = await read(value, [failed, successful])
    const finding = first.findings.find((candidate) => candidate.kind === "providerError")

    expect(finding).toMatchObject({
      evidenceKey: `span:${failed.spanId}:provider-error:rateLimit`,
      findingKind: "rateLimit",
      recovered: true,
      sameSubjectRecovered: false,
      terminal: false,
    })
    expect(second.findings.find((candidate) => candidate.kind === "providerError")?.evidenceKey).toBe(
      finding?.evidenceKey,
    )
  })

  it("pairs a length finish reason only with final output damage", async () => {
    const generation = span("c", 0, 10, { finishReasons: ["length"] })
    const damaged = await read(
      session([{ role: "assistant", parts: [{ type: "text", content: '{"answer":"unfinished' }] }]),
      [generation],
    )
    const intact = await read(
      session([{ role: "assistant", parts: [{ type: "text", content: '{"answer":"done"}' }] }]),
      [generation],
    )

    expect(damaged.findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining(["outputDamage", "finishFailure"]),
    )
    expect(intact.findings.some((finding) => finding.kind === "finishFailure")).toBe(false)
  })

  it("reports unmapped span telemetry as a coverage limitation without creating findings", async () => {
    const generation = span("d", 0, 10, {
      errorType: "FutureProviderError",
      finishReasons: ["FUTURE_REASON"],
      statusCode: "error",
    })
    const result = await read(
      session([{ role: "assistant", parts: [{ type: "text", content: "Delivered answer" }] }]),
      [generation],
    )

    expect(
      result.findings.some((finding) => finding.kind === "providerError" || finding.kind === "finishFailure"),
    ).toBe(false)
    expect(result.readers.filter((reader) => reader.readerId.startsWith("spans."))).toEqual([
      expect.objectContaining({ readerId: "spans.finish_failure", limitation: "unmappedTelemetry", readableCount: 0 }),
      expect.objectContaining({ readerId: "spans.provider_error", limitation: "unmappedTelemetry", readableCount: 0 }),
    ])
  })
})

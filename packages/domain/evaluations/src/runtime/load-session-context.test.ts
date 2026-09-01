import { ChSqlClient, ExternalUserId, OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import {
  type SessionDetail,
  SessionRepository,
  type SessionToolSpan,
  type Span,
  SpanRepository,
  type TraceDetail,
} from "@domain/spans"
import { createFakeSessionRepository, createFakeSpanRepository, stubListSpan } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { loadScriptSessionContext } from "./load-session-context.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const traceA = TraceId("a".repeat(32))
const traceB = TraceId("b".repeat(32))
const sessionId = SessionId("session-1")

const span = (overrides: Partial<Span> & Pick<Span, "traceId" | "spanId">): Span => ({
  ...stubListSpan({
    organizationId,
    projectId,
    traceId: overrides.traceId,
    sessionId,
    spanId: overrides.spanId,
    operation: "chat",
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:00.500Z"),
  }),
  ...overrides,
})

const traceDetail: TraceDetail = {
  organizationId,
  projectId,
  traceId: traceA,
  spanCount: 3,
  errorCount: 1,
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
  unpricedSpanCount: 0,
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
    { role: "user", parts: [{ type: "text", content: "summarize the deploy" }] },
    { role: "assistant", parts: [{ type: "text", content: "migrations, rollback, dashboards" }] },
  ],
}

const longInput = "x".repeat(5_000)

const sessionDetail: SessionDetail = {
  organizationId,
  projectId,
  sessionId,
  traceCount: 2,
  traceIds: [traceA as string],
  spanCount: 5,
  errorCount: 0,
  startTime: new Date("2026-01-01T00:00:00.000Z"),
  endTime: new Date("2026-01-01T00:00:02.000Z"),
  lastActivityTime: new Date("2026-01-01T00:00:02.000Z"),
  durationNs: 2_000_000_000,
  timeToFirstTokenNs: 100,
  tokensInput: 200,
  tokensOutput: 100,
  tokensCacheRead: 0,
  tokensCacheCreate: 0,
  tokensReasoning: 0,
  tokensTotal: 300,
  costInputMicrocents: 600,
  costOutputMicrocents: 399,
  costTotalMicrocents: 999,
  unpricedSpanCount: 0,
  userId: ExternalUserId("rollup-user"),
  userEmail: "",
  simulationId: "",
  tags: ["rollup"],
  metadata: { src: "rollup" },
  models: ["gpt-4o"],
  providers: ["openai"],
  serviceNames: ["web"],
  agentNames: [],
  definedTools: [],
  rootSpanId: "",
  rootSpanName: "root",
  systemInstructions: [],
  inputMessages: [],
  lastInputMessages: [{ role: "user", parts: [{ type: "text", content: "rollup question" }] }],
  outputMessages: [{ role: "assistant", parts: [{ type: "text", content: "rollup answer" }] }],
}

const runLoader = (input: {
  spans: readonly Span[]
  toolSpans: readonly SessionToolSpan[]
  sessionDetail?: SessionDetail
}) => {
  const { repository: sessionRepository } = createFakeSessionRepository(
    input.sessionDetail ? { findBySessionId: () => Effect.succeed(input.sessionDetail as SessionDetail) } : undefined,
  )
  const { repository: spanRepository } = createFakeSpanRepository({
    listBySessionId: () => Effect.succeed(input.spans),
    listToolSpansBySessionId: () => Effect.succeed(input.toolSpans),
  })
  return Effect.runPromise(
    loadScriptSessionContext({ organizationId, projectId, traceDetail }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(SessionRepository, sessionRepository),
          Layer.succeed(SpanRepository, spanRepository),
          Layer.succeed(ChSqlClient, {} as never),
        ),
      ),
    ),
  )
}

describe("loadScriptSessionContext", () => {
  it("builds the deduped conversation from the trace when the session aggregate is absent", async () => {
    const session = await runLoader({ spans: [], toolSpans: [] })
    expect(session.conversation).toEqual([
      { role: "user", content: "summarize the deploy" },
      { role: "assistant", content: "migrations, rollback, dashboards" },
    ])
  })

  it("builds conversation and aggregates from the session rollup when present", async () => {
    const session = await runLoader({
      sessionDetail,
      spans: [span({ traceId: traceA, spanId: SpanId("a1".padEnd(16, "0")) })],
      toolSpans: [],
    })
    // conversation comes from the rollup reconstruction (system + lastInput + outputs), not the trace
    expect(session.conversation).toEqual([
      { role: "user", content: "rollup question" },
      { role: "assistant", content: "rollup answer" },
    ])
    // session-level aggregates come from the rollup, not the trace fallback (traceCount 1 / cost 75 / tokens 200)
    expect(session.id).toBe("session-1")
    expect(session.traceCount).toBe(2)
    expect(session.cost.total).toBe(999)
    expect(session.tokens.total).toBe(300)
    expect(session.tags).toEqual(["rollup"])
    // per-trace rollups are still assembled from the session's spans
    expect(session.traces).toHaveLength(1)
  })

  it("falls back to the earliest span for per-trace duration when no root span is present", async () => {
    const session = await runLoader({
      spans: [
        span({
          traceId: traceA,
          spanId: SpanId("a1".padEnd(16, "0")),
          parentSpanId: "p".repeat(16), // no span with parentSpanId === "" → root falls back to group[0]
          startTime: new Date("2026-01-01T00:00:00.000Z"),
          endTime: new Date("2026-01-01T00:00:00.250Z"),
        }),
      ],
      toolSpans: [],
    })
    expect(session.traces[0]?.duration).toBe(250_000_000)
  })

  it("groups spans into per-trace rollups (metrics, models, providers, finish reasons, status)", async () => {
    const session = await runLoader({
      spans: [
        span({
          traceId: traceA,
          spanId: SpanId("a1".padEnd(16, "0")),
          name: "root",
          model: "gpt-4o",
          provider: "openai",
          finishReasons: ["stop"],
          tokensInput: 10,
          tokensOutput: 5,
          costTotalMicrocents: 7,
        }),
        span({
          traceId: traceA,
          spanId: SpanId("a2".padEnd(16, "0")),
          parentSpanId: "a1".padEnd(16, "0"),
          model: "gpt-4o",
          finishReasons: ["length"],
          tokensInput: 3,
          tokensOutput: 0,
        }),
        span({ traceId: traceB, spanId: SpanId("b1".padEnd(16, "0")), statusCode: "error", errorType: "Timeout" }),
      ],
      toolSpans: [],
    })

    expect(session.traces).toHaveLength(2)
    const a = session.traces.find((t) => t.id === traceA)
    expect(a?.models).toEqual(["gpt-4o"])
    expect(a?.providers).toEqual(["openai"])
    expect(a?.finishReasons).toEqual(["stop", "length"])
    expect(a?.status).toBe("ok")
    expect(a?.spanCount).toBe(2)
    expect(a?.tokens.input).toBe(13)

    const b = session.traces.find((t) => t.id === traceB)
    expect(b?.status).toBe("error")
    expect(b?.errorCount).toBe(1)
  })

  it("projects tool spans per trace and truncates their I/O", async () => {
    const session = await runLoader({
      spans: [span({ traceId: traceA, spanId: SpanId("a1".padEnd(16, "0")) })],
      toolSpans: [
        { traceId: traceA, name: "search", input: longInput, output: "ok", error: false, durationNs: 42 },
        { traceId: traceA, name: "delete", input: "{}", output: "boom", error: true, durationNs: 7 },
      ],
    })

    const tools = session.traces.find((t) => t.id === traceA)?.tools ?? []
    expect(tools).toHaveLength(2)
    expect(tools[0]?.name).toBe("search")
    expect(tools[0]?.input.length).toBeLessThan(longInput.length)
    expect(tools[0]?.input.endsWith("…")).toBe(true)
    expect(tools[1]).toMatchObject({ name: "delete", error: true, duration: 7 })
  })
})

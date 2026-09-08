import type { FlaggerScreeningDecision } from "@domain/flaggers"
import type { Score } from "@domain/scores"
import { OrganizationId, ProjectId, ScoreId, SessionId, SignalId, SpanId, TraceId } from "@domain/shared"
import type { SignalWithLifecycle } from "@domain/signals"
import type { SessionDetail, Span } from "@domain/spans"
import { stubListSpan } from "@domain/spans/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { resolveSessionAssessment } from "../resolver/resolve-session-assessment.ts"
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

const read = (
  value: SessionDetail,
  spans: readonly Span[] = [],
  judgments: {
    readonly scores?: readonly Score[]
    readonly signals?: readonly SignalWithLifecycle[]
    readonly screeningDecisions?: readonly FlaggerScreeningDecision[]
  } = {},
) =>
  Effect.runPromise(
    readSessionAssessmentSources({
      session: value,
      spans,
      scores: judgments.scores ?? [],
      signals: judgments.signals ?? [],
      moments: { moments: [], labels: [] },
      screeningDecisions: judgments.screeningDecisions ?? [],
    }),
  )

const score = (id: string, signalId: string, metadata: Record<string, unknown> = {}): Score =>
  ({
    id: ScoreId(id),
    organizationId,
    projectId,
    sessionId,
    traceId,
    spanId: null,
    simulationId: null,
    signalId: SignalId(signalId),
    sourceType: "annotation",
    sourceId: "SYSTEM",
    value: 0,
    passed: false,
    feedback: `Feedback for ${id}`,
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: null,
    metadata: { rawFeedback: `Feedback for ${id}`, ...metadata },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  }) as Score

const signal = (id: string, ignored = false): SignalWithLifecycle =>
  ({
    id: SignalId(id),
    name: `Signal ${id}`,
    origin: "user",
    scoreEvidence: [{ scoreDimension: "reliability", role: "operationalIncident" }],
    ignoredAt: ignored ? new Date("2026-01-01T00:00:00.000Z") : null,
  }) as SignalWithLifecycle

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
    expect(resolveSessionAssessment(result).items.find((item) => item.metricId === "sessions.no_output")).toMatchObject(
      {
        polarity: "negative",
        impactLevel: "high",
      },
    )
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
    expect(
      resolveSessionAssessment(first).items.find((item) => item.metricId === "spans.provider_error")?.effects,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scoreDimension: "reliability", direction: "context", measurement: "observed" }),
      ]),
    )
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
    expect(resolveSessionAssessment(damaged).items.filter((item) => item.metricId === "spans.finish_failure")).toEqual(
      expect.arrayContaining([expect.objectContaining({ polarity: "negative", impactLevel: "high" })]),
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

  it("resolves several tool defects with one linked discovery score", async () => {
    const value = session([
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "call-1", name: "search", arguments: { q: "first" } }],
      },
      { role: "tool", parts: [{ type: "tool_call_response", id: "call-1", response: { error: "timeout" } }] },
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "call-2", name: "search", arguments: { q: "second" } }],
      },
      { role: "tool", parts: [{ type: "tool_call_response", id: "call-2", response: { ok: true } }] },
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "call-2", name: "search", arguments: { q: "duplicate" } }],
      },
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "call-3", name: "search", arguments: { q: "third" } }],
      },
      { role: "tool", parts: [{ type: "tool_call_response", id: "call-3", response: { error: "broken" } }] },
      { role: "assistant", parts: [{ type: "text", content: "Completed with available results" }] },
    ])
    const deterministic = await read(value)
    const selected = deterministic.findings.find(
      (finding) => finding.kind === "toolStructuralDefect" && finding.findingKind === "duplicate",
    )
    if (!selected) throw new Error("expected duplicate tool finding")
    const linkedScore = score("score-discovery", "signal-tools", {
      flaggerSlug: "tool-call-errors",
      flaggerPath: "deterministic",
      flaggerFindingKey: selected.evidenceKey,
    })
    const resolved = resolveSessionAssessment(
      await read(value, [], { scores: [linkedScore], signals: [signal("signal-tools")] }),
    )
    const toolItems = resolved.items.filter(
      (item) => item.metricId === "tools.call_failed" || item.metricId === "tools.structural_defect",
    )

    expect(toolItems).toHaveLength(3)
    expect(toolItems.find((item) => item.evidenceKey === selected.evidenceKey)).toMatchObject({
      scoreIds: ["score-discovery"],
      signalIds: ["signal-tools"],
      groupKey: "signal:signal-tools",
    })
  })

  it("groups overlapping active signals, excludes ignored signal scores, and exposes unexamined flaggers", async () => {
    const activeSignal = signal("signal-overlap")
    const ignoredSignal = signal("signal-ignored", true)
    const screeningDecision = {
      decisionId: "d".repeat(64),
      organizationId,
      projectId,
      sessionId,
      flaggerSlug: "refusal",
      analysisHash: "a".repeat(64),
      scoringArtifactVersion: "flagger-screening-v1",
      attempt: 1,
      version: 1,
      selected: false,
      reason: "ordinary-sample",
      inclusionProbability: 0.1,
      hintKinds: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      retentionDays: 90,
    } satisfies FlaggerScreeningDecision
    const resolved = resolveSessionAssessment(
      await read(session([{ role: "assistant", parts: [{ type: "text", content: "Done" }] }]), [], {
        scores: [
          score("score-active-1", "signal-overlap"),
          score("score-active-2", "signal-overlap"),
          score("score-ignored", "signal-ignored"),
        ],
        signals: [activeSignal, ignoredSignal],
        screeningDecisions: [screeningDecision],
      }),
    )

    expect(resolved.items.filter((item) => item.groupKey === "signal:signal-overlap")).toHaveLength(2)
    expect(resolved.items.some((item) => item.scoreIds.includes("score-ignored"))).toBe(false)
    expect(resolved.coverage.readers.find((reader) => reader.readerId === "flagger:refusal")).toMatchObject({
      status: "notExamined",
      limitation: "notSelected",
    })
  })

  it("resolves an unrecovered final tool failure as a terminal reliability issue", async () => {
    const result = resolveSessionAssessment(
      await read(
        session([
          {
            role: "assistant",
            parts: [{ type: "tool_call", id: "call-terminal", name: "search", arguments: {} }],
          },
          {
            role: "tool",
            parts: [{ type: "tool_call_response", id: "call-terminal", response: { error: "timeout" } }],
          },
        ]),
      ),
    )

    expect(result.items.find((item) => item.metricId === "tools.call_failed")).toMatchObject({
      polarity: "negative",
      impactLevel: "high",
    })
  })
})

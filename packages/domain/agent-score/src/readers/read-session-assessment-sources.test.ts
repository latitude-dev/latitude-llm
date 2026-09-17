import type { FlaggerScreeningDecision } from "@domain/flaggers"
import type { SafetyFindingKind, Score } from "@domain/scores"
import { OrganizationId, ProjectId, ScoreId, SessionId, SignalId, SpanId, TraceId } from "@domain/shared"
import type { SignalWithLifecycle } from "@domain/signals"
import type { SessionDetail, SessionGenerationFact, SessionToolCallFact, Span } from "@domain/spans"
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

const generation = (
  id: string,
  startMs: number,
  endMs: number,
  overrides: Partial<SessionGenerationFact> = {},
): SessionGenerationFact =>
  ({
    traceId,
    spanId: SpanId(id.repeat(16)),
    parentSpanId: "",
    operation: "chat",
    provider: "openai",
    model: "gpt-4o",
    responseModel: "",
    startTime: new Date(startMs),
    endTime: new Date(endMs),
    durationNs: Math.max(0, endMs - startMs) * 1_000_000,
    name: "chat",
    toolName: "",
    agentName: "",
    tokens: {
      tokensInput: 100,
      tokensOutput: 20,
      tokensCacheRead: 0,
      tokensCacheCreate: 0,
      tokensReasoning: 0,
    },
    costInputMicrocents: 100,
    costOutputMicrocents: 100,
    costTotalMicrocents: 200,
    costSource: "estimated",
    costPricedProvider: "openai",
    costPricedModel: "gpt-4o",
    isStreaming: true,
    timeToFirstTokenNs: 1_000_000,
    finishReasons: ["stop"],
    statusCode: "ok",
    statusMessage: "",
    errorType: "",
    capturedBytes: { inputMessages: 0, outputMessages: 0, toolDefinitions: 0 },
    content: null,
    inputContentState: "absent",
    outputContentState: "absent",
    toolDefinitionContentState: "absent",
    pricingState: "registryEstimated",
    modelContextState: "known",
    modelContextLimitTokens: 128_000,
    ...overrides,
  }) as SessionGenerationFact

const toolCall = (
  id: string,
  toolCallId: string,
  startMs: number,
  endMs: number,
  overrides: Partial<SessionToolCallFact> = {},
): SessionToolCallFact =>
  ({
    traceId,
    spanId: SpanId(id.repeat(16)),
    parentSpanId: "",
    toolCallId,
    toolName: "search",
    normalizedToolName: "search",
    inputHash: `input-${id}`,
    outputHash: `output-${id}`,
    inputBytes: 10,
    outputBytes: 10,
    startTime: new Date(startMs),
    endTime: new Date(endMs),
    durationNs: Math.max(0, endMs - startMs) * 1_000_000,
    statusCode: "ok",
    statusMessage: "",
    errorType: "",
    ...overrides,
  }) as SessionToolCallFact

const read = (
  value: SessionDetail,
  spans: readonly Span[] = [],
  judgments: {
    readonly scores?: readonly Score[]
    readonly signals?: readonly SignalWithLifecycle[]
    readonly screeningDecisions?: readonly FlaggerScreeningDecision[]
    readonly generations?: readonly SessionGenerationFact[]
    readonly toolCalls?: readonly SessionToolCallFact[]
  } = {},
) =>
  Effect.runPromise(
    readSessionAssessmentSources({
      session: value,
      spans,
      generations: judgments.generations ?? [],
      toolCalls: judgments.toolCalls ?? [],
      memoryEvents: [],
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

  it("attributes provider recovery only through the successful retry", async () => {
    const failed = span("e", 0, 10, {
      errorType: "RateLimitError",
      finishReasons: [],
      statusCode: "error",
    })
    const successful = span("f", 11, 20)
    const later = span("g", 21, 30)
    const result = await read(
      session([{ role: "assistant", parts: [{ type: "text", content: "Recovered answer" }] }]),
      [failed, successful, later],
      {
        generations: [
          generation("e", 0, 10, {
            errorType: "RateLimitError",
            finishReasons: [],
            statusCode: "error",
            costTotalMicrocents: 100,
          }),
          generation("f", 11, 20, { costTotalMicrocents: 250 }),
          generation("g", 21, 30, { costTotalMicrocents: 600 }),
        ],
      },
    )

    expect(result.findings.find((finding) => finding.kind === "providerError")).toMatchObject({
      successfulSpanId: successful.spanId,
    })
    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "cost.recoverable_spend_share"),
    ).toMatchObject({
      adverseUnits: 250,
      observations: [expect.objectContaining({ atomId: `generation:${successful.traceId}:${successful.spanId}` })],
    })
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
    expect(
      result.readers.filter((reader) => ["spans.finish_failure", "spans.provider_error"].includes(reader.readerId)),
    ).toEqual([
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

  it("attaches the producing flagger's sampling probability to a signal finding", async () => {
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
      selected: true,
      reason: "ordinary-sample",
      inclusionProbability: 0.25,
      hintKinds: [],
      outcome: "matched",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      retentionDays: 90,
    } satisfies FlaggerScreeningDecision
    const assessment = await read(session([{ role: "assistant", parts: [{ type: "text", content: "Done" }] }]), [], {
      scores: [score("sampled-score", "sampled-signal", { flaggerSlug: "refusal" })],
      signals: [signal("sampled-signal")],
      screeningDecisions: [screeningDecision],
    })

    expect(assessment.findings.find((finding) => finding.scoreIds.includes("sampled-score"))).toMatchObject({
      observationProbability: 0.25,
    })
  })

  it("attributes a recovered tool failure to the generation that completed the session", async () => {
    const failedCall = toolCall("h", "call-recovered", 0, 10, { statusCode: "error" })
    const retry = generation("i", 11, 20, { costTotalMicrocents: 325 })
    const result = await read(
      session([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-recovered", name: "search", arguments: {} }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-recovered", response: { error: "timeout" } }],
        },
        { role: "assistant", parts: [{ type: "text", content: "Recovered answer" }] },
      ]),
      [],
      { generations: [retry], toolCalls: [failedCall] },
    )

    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "recovery.recovered_incident_rate"),
    ).toMatchObject({ adverseUnits: 1 })
    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "cost.recoverable_spend_share"),
    ).toMatchObject({ adverseUnits: 325 })
  })

  it("attributes tool recovery to progress in a later trace", async () => {
    const otherTraceId = TraceId("u".repeat(32))
    const failedCall = toolCall("h", "call-cross-trace", 0, 10, {
      statusCode: "error",
      statusMessage: "upstream unavailable",
    })
    const root = generation("i", 11, 30, {
      traceId: otherTraceId,
      parentSpanId: "",
      operation: "invoke_agent",
      provider: "",
      model: "",
      costTotalMicrocents: 0,
      pricingState: "notSpendBearing",
    })
    const retry = generation("j", 12, 20, {
      traceId: otherTraceId,
      parentSpanId: root.spanId,
      costTotalMicrocents: 325,
    })
    const value = session([
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "call-cross-trace", name: "search", arguments: {} }],
      },
      {
        role: "tool",
        parts: [{ type: "tool_call_response", id: "call-cross-trace", response: "No results" }],
      },
      { role: "assistant", parts: [{ type: "text", content: "Recovered answer" }] },
    ])
    const result = await read({ ...value, traceIds: [traceId, otherTraceId] }, [], {
      generations: [root, retry],
      toolCalls: [failedCall],
    })

    expect(result.findings.find((finding) => finding.kind === "toolFailure")).toMatchObject({
      recovered: true,
      terminal: false,
    })
    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "recovery.recovered_incident_rate"),
    ).toMatchObject({ adverseUnits: 1 })
    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "cost.recoverable_spend_share"),
    ).toMatchObject({ adverseUnits: 325 })
    expect(result.costEvidence).toMatchObject({
      measuredAvoidableNs: 8_000_000,
      avoidableNsByCause: { "recovered:toolFailure": 8_000_000 },
    })
  })

  it("reads a tool failure the instrumentation recorded on the span with a plain-text result", async () => {
    const failedCall = toolCall("m", "call-429", 0, 10, {
      toolName: "get_booking",
      normalizedToolName: "get_booking",
      statusCode: "error",
      statusMessage: "429 rate limited by carrier feed (LH): retry after 6s",
      errorType: "Error",
    })
    const retryCall = toolCall("n", "call-429-retry", 11, 20, {
      toolName: "get_booking",
      normalizedToolName: "get_booking",
    })
    const root = generation("l", 0, 30, {
      parentSpanId: "",
      operation: "invoke_agent",
      provider: "",
      model: "",
      costTotalMicrocents: 0,
      pricingState: "notSpendBearing",
    })
    const failedToolSpan = generation("m", 0, 10, {
      parentSpanId: root.spanId,
      operation: "execute_tool",
      statusCode: "error",
      costTotalMicrocents: 0,
      pricingState: "notSpendBearing",
    })
    const retryToolSpan = generation("n", 11, 20, {
      parentSpanId: root.spanId,
      operation: "execute_tool",
      costTotalMicrocents: 0,
      pricingState: "notSpendBearing",
    })
    const result = await read(
      session([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-429", name: "get_booking", arguments: {} }],
        },
        {
          role: "tool",
          parts: [
            {
              type: "tool_call_response",
              id: "call-429",
              response: "429 rate limited by carrier feed (LH): retry after 6s",
            },
          ],
        },
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-429-retry", name: "get_booking", arguments: {} }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-429-retry", response: "Booking LH1234 confirmed" }],
        },
        { role: "assistant", parts: [{ type: "text", content: "Your booking is confirmed" }] },
      ]),
      [],
      { generations: [root, failedToolSpan, retryToolSpan], toolCalls: [failedCall, retryCall] },
    )

    expect(result.findings.filter((finding) => finding.kind === "toolFailure")).toMatchObject([
      {
        metricId: "tools.call_failed",
        recovered: true,
        sameSubjectRecovered: true,
        terminal: false,
        description: "429 rate limited by carrier feed (LH): retry after 6s",
      },
    ])
    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "recovery.recovered_incident_rate"),
    ).toMatchObject({ adverseUnits: 1 })
    expect(
      resolveSessionAssessment(result).dimensions.find((summary) => summary.scoreDimension === "reliability"),
    ).toMatchObject({ recoveredIncidentCount: 1 })
    expect(result.costEvidence).toMatchObject({
      measuredAvoidableNs: 9_000_000,
      avoidableNsByCause: { "recovered:toolFailure": 9_000_000 },
    })
  })

  it("reports one tool failure when both the response body and the span status carry it", async () => {
    const failedCall = toolCall("o", "call-both", 0, 10, { statusCode: "error", statusMessage: "timeout" })
    const result = await read(
      session([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-both", name: "search", arguments: {} }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-both", response: { error: "timeout" } }],
        },
        { role: "assistant", parts: [{ type: "text", content: "Recovered answer" }] },
      ]),
      [],
      { toolCalls: [failedCall] },
    )

    expect(result.findings.filter((finding) => finding.kind === "toolFailure")).toHaveLength(1)
  })

  it("keeps a content-detected failure terminal when its apparent recovery span failed", async () => {
    const failedCall = toolCall("o", "call-initial", 0, 10, { statusCode: "error", statusMessage: "timeout" })
    const failedRetry = toolCall("r", "call-retry", 11, 20, {
      statusCode: "error",
      statusMessage: "invalid response",
    })
    const result = await read(
      session([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-initial", name: "search", arguments: {} }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-initial", response: { error: "timeout" } }],
        },
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-retry", name: "search", arguments: {} }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-retry", response: { results: [] } }],
        },
        { role: "assistant", parts: [{ type: "text", content: "No results found" }] },
      ]),
      [],
      { toolCalls: [failedCall, failedRetry] },
    )
    const failures = result.findings.filter((finding) => finding.kind === "toolFailure")

    expect(failures).toHaveLength(2)
    expect(failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          anchors: expect.arrayContaining([expect.objectContaining({ kind: "span", spanId: failedCall.spanId })]),
          recovered: false,
          terminal: true,
        }),
        expect.objectContaining({
          anchors: expect.arrayContaining([expect.objectContaining({ kind: "span", spanId: failedRetry.spanId })]),
          recovered: false,
          terminal: true,
        }),
      ]),
    )
    expect(
      resolveSessionAssessment(result).dimensions.find((summary) => summary.scoreDimension === "reliability"),
    ).toMatchObject({ recoveredIncidentCount: 0, unrecoveredIncidentCount: 2 })
  })

  it("does not recover a status failure through a content-failed tool span", async () => {
    const failedCall = toolCall("o", "call-status-failure", 0, 10, {
      statusCode: "error",
      statusMessage: "upstream unavailable",
    })
    const failedRetry = toolCall("r", "call-content-failure", 11, 20)
    const result = await read(
      session([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-status-failure", name: "search", arguments: {} }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-status-failure", response: "No inventory" }],
        },
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-content-failure", name: "search", arguments: {} }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-content-failure", response: { error: "invalid response" } }],
        },
        { role: "assistant", parts: [{ type: "text", content: "No results found" }] },
      ]),
      [],
      { toolCalls: [failedCall, failedRetry] },
    )
    const initial = result.findings.find(
      (finding) =>
        finding.kind === "toolFailure" &&
        finding.anchors.some((anchor) => anchor.kind === "span" && anchor.spanId === failedCall.spanId),
    )

    expect(initial).toMatchObject({ recovered: false, sameSubjectRecovered: false, terminal: true })
  })

  it("attributes recovery past a content-failed tool span to the later successful generation", async () => {
    const failedCall = toolCall("o", "call-status-failure", 0, 10, {
      statusCode: "error",
      statusMessage: "upstream unavailable",
    })
    const failedRetry = toolCall("r", "call-content-failure", 11, 20)
    const recoveredAnswer = generation("s", 21, 30, { costTotalMicrocents: 325 })
    const result = await read(
      session([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-status-failure", name: "search", arguments: {} }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-status-failure", response: "No inventory" }],
        },
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-content-failure", name: "search", arguments: {} }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-content-failure", response: { error: "invalid response" } }],
        },
        { role: "assistant", parts: [{ type: "text", content: "Recovered answer" }] },
      ]),
      [],
      { generations: [recoveredAnswer], toolCalls: [failedCall, failedRetry] },
    )
    const initial = result.findings.find(
      (finding) =>
        finding.kind === "toolFailure" &&
        finding.anchors.some((anchor) => anchor.kind === "span" && anchor.spanId === failedCall.spanId),
    )

    expect(initial).toMatchObject({ recovered: true, sameSubjectRecovered: false, terminal: false })
    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "cost.recoverable_spend_share"),
    ).toMatchObject({
      adverseUnits: 325,
      observations: [expect.objectContaining({ atomId: `generation:${traceId}:${recoveredAnswer.spanId}` })],
    })
  })

  it("deduplicates a content failure against its unique tool span in an earlier trace", async () => {
    const laterTraceId = TraceId("u".repeat(32))
    const failedCall = toolCall("w", "call-earlier-trace", 0, 10, {
      statusCode: "error",
      statusMessage: "timeout",
    })
    const retry = generation("x", 11, 20, {
      traceId: laterTraceId,
      costTotalMicrocents: 325,
    })
    const value = session([
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "call-earlier-trace", name: "search", arguments: {} }],
      },
      {
        role: "tool",
        parts: [{ type: "tool_call_response", id: "call-earlier-trace", response: { error: "timeout" } }],
      },
      { role: "assistant", parts: [{ type: "text", content: "Recovered answer" }] },
    ])
    const result = await read({ ...value, traceIds: [traceId, laterTraceId] }, [], {
      generations: [retry],
      toolCalls: [failedCall],
    })
    const failures = result.findings.filter((finding) => finding.kind === "toolFailure")

    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({
      anchors: expect.arrayContaining([
        expect.objectContaining({ kind: "span", traceId, spanId: failedCall.spanId }),
        expect.objectContaining({ kind: "toolCall", traceId, toolCallId: failedCall.toolCallId }),
      ]),
      destinations: expect.arrayContaining([
        expect.objectContaining({ kind: "toolCall", traceId, toolCallId: failedCall.toolCallId }),
      ]),
    })
    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "cost.recoverable_spend_share"),
    ).toMatchObject({ adverseUnits: 325 })
  })

  it("does not deduplicate matching tool-call IDs from different traces", async () => {
    const otherTraceId = TraceId("u".repeat(32))
    const primaryFailure = toolCall("w", "call-shared", 0, 10, {
      statusCode: "error",
      statusMessage: "timeout",
    })
    const otherFailure = toolCall("x", "call-shared", 0, 10, {
      traceId: otherTraceId,
      statusCode: "error",
      statusMessage: "rate limited",
    })
    const value = session([
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "call-shared", name: "search", arguments: {} }],
      },
      {
        role: "tool",
        parts: [{ type: "tool_call_response", id: "call-shared", response: { error: "timeout" } }],
      },
      { role: "assistant", parts: [{ type: "text", content: "Recovered answer" }] },
    ])
    const result = await read({ ...value, traceIds: [otherTraceId, traceId] }, [], {
      toolCalls: [primaryFailure, otherFailure],
    })
    const failures = result.findings.filter((finding) => finding.kind === "toolFailure")

    expect(failures).toHaveLength(2)
    expect(
      failures.flatMap((finding) =>
        finding.anchors.flatMap((anchor) => (anchor.kind === "toolCall" ? [anchor.traceId] : [])),
      ),
    ).toEqual(expect.arrayContaining([traceId, otherTraceId]))
  })

  it("keeps evidence keys distinct when traces reuse a tool span ID", async () => {
    const otherTraceId = TraceId("u".repeat(32))
    const primaryFailure = toolCall("v", "call-primary", 0, 10, {
      statusCode: "error",
      statusMessage: "timeout",
    })
    const otherFailure = toolCall("v", "call-other", 0, 10, {
      traceId: otherTraceId,
      statusCode: "error",
      statusMessage: "timeout",
    })
    const value = session([{ role: "assistant", parts: [{ type: "text", content: "Recovered answer" }] }])
    const result = await read({ ...value, traceIds: [traceId, otherTraceId] }, [], {
      toolCalls: [primaryFailure, otherFailure],
    })
    const evidenceKeys = result.findings
      .filter((finding) => finding.kind === "toolFailure")
      .map((finding) => finding.evidenceKey)

    expect(evidenceKeys).toEqual([
      `span:${traceId}:${primaryFailure.spanId}:tool-failure:timeout`,
      `span:${otherTraceId}:${otherFailure.spanId}:tool-failure:timeout`,
    ])
  })

  it("preserves a status failure when spans in one trace reuse a tool-call ID", async () => {
    const firstFailure = toolCall("y", "call-reused", 0, 10, {
      statusCode: "error",
      statusMessage: "timeout",
    })
    const secondFailure = toolCall("z", "call-reused", 11, 20, {
      statusCode: "error",
      statusMessage: "rate limited",
    })
    const result = await read(
      session([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-reused", name: "search", arguments: {} }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-reused", response: { error: "timeout" } }],
        },
        { role: "assistant", parts: [{ type: "text", content: "Recovered answer" }] },
      ]),
      [],
      { toolCalls: [firstFailure, secondFailure] },
    )
    const failures = result.findings.filter((finding) => finding.kind === "toolFailure")

    expect(failures).toHaveLength(2)
    expect(
      failures.find((finding) => finding.evidenceKey.startsWith(`span:${traceId}:${secondFailure.spanId}:`)),
    ).toMatchObject({
      anchors: expect.arrayContaining([
        expect.objectContaining({ kind: "span", traceId, spanId: secondFailure.spanId }),
        expect.objectContaining({ kind: "toolCall", traceId, toolCallId: "call-reused" }),
      ]),
    })
  })

  it("matches a content failure to one span when a successful retry reuses its call ID", async () => {
    const failedCall = toolCall("y", "call-reused", 0, 10, {
      statusCode: "error",
      statusMessage: "timeout",
    })
    const successfulRetry = toolCall("z", "call-reused", 11, 20)
    const result = await read(
      session([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-reused", name: "search", arguments: { q: "first" } }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-reused", response: { error: "timeout" } }],
        },
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-reused", name: "search", arguments: { q: "retry" } }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-reused", response: { results: ["found"] } }],
        },
        { role: "assistant", parts: [{ type: "text", content: "Found it" }] },
      ]),
      [],
      { toolCalls: [failedCall, successfulRetry] },
    )
    const failure = result.findings.find((finding) => finding.kind === "toolFailure")

    expect(result.findings.filter((finding) => finding.kind === "toolFailure")).toHaveLength(1)
    expect(failure).toMatchObject({
      anchors: expect.arrayContaining([expect.objectContaining({ kind: "span", traceId, spanId: failedCall.spanId })]),
      recovered: true,
      sameSubjectRecovered: true,
      terminal: false,
    })
    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "recovery.recovered_incident_rate"),
    ).toMatchObject({ adverseUnits: 1 })
  })

  it("matches a sparse reused-ID content failure to the span whose status failed", async () => {
    const successfulCall = toolCall("y", "call-reused", 0, 10)
    const failedCall = toolCall("z", "call-reused", 11, 20, {
      statusCode: "error",
      statusMessage: "timeout",
    })
    const result = await read(
      session([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-reused", name: "search", arguments: { q: "first" } }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-reused", response: { results: ["first"] } }],
        },
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-reused", name: "search", arguments: { q: "retry" } }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-reused", response: { error: "timeout" } }],
        },
        { role: "assistant", parts: [{ type: "text", content: "No results found" }] },
      ]),
      [],
      { toolCalls: [successfulCall, failedCall] },
    )
    const failures = result.findings.filter((finding) => finding.kind === "toolFailure")

    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({
      anchors: expect.arrayContaining([expect.objectContaining({ kind: "span", traceId, spanId: failedCall.spanId })]),
      recovered: false,
      terminal: true,
    })
    expect(failures[0]?.anchors).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "span", spanId: successfulCall.spanId })]),
    )
  })

  it("matches multiple reused-ID content failures to distinct spans", async () => {
    const contentFailedCall = toolCall("y", "call-reused", 0, 10)
    const statusFailedCall = toolCall("z", "call-reused", 11, 20, {
      statusCode: "error",
      statusMessage: "rate limited",
    })
    const result = await read(
      session([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-reused", name: "search", arguments: { q: "first" } }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-reused", response: { error: "timeout" } }],
        },
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-reused", name: "search", arguments: { q: "retry" } }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-reused", response: { error: "rate limited" } }],
        },
        { role: "assistant", parts: [{ type: "text", content: "No results found" }] },
      ]),
      [],
      { toolCalls: [contentFailedCall, statusFailedCall] },
    )
    const failures = result.findings.filter((finding) => finding.kind === "toolFailure")
    const anchoredSpanIds = failures.flatMap((finding) =>
      finding.anchors.flatMap((anchor) => (anchor.kind === "span" ? [anchor.spanId] : [])),
    )

    expect(failures).toHaveLength(2)
    expect(anchoredSpanIds).toEqual(expect.arrayContaining([contentFailedCall.spanId, statusFailedCall.spanId]))
    expect(new Set(anchoredSpanIds).size).toBe(2)
  })

  it("keeps conflicting reused-ID content and status failures as distinct incidents", async () => {
    const contentFailedCall = toolCall("y", "call-reused", 0, 10)
    const statusFailedCall = toolCall("z", "call-reused", 11, 20, {
      statusCode: "error",
      statusMessage: "transport failure",
    })
    const result = await read(
      session([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-reused", name: "search", arguments: { q: "first" } }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-reused", response: { error: "invalid response" } }],
        },
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-reused", name: "search", arguments: { q: "retry" } }],
        },
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call-reused", response: { results: ["found"] } }],
        },
        { role: "assistant", parts: [{ type: "text", content: "Found it" }] },
      ]),
      [],
      { toolCalls: [contentFailedCall, statusFailedCall] },
    )
    const failures = result.findings.filter((finding) => finding.kind === "toolFailure")
    const anchoredSpanIds = failures.flatMap((finding) =>
      finding.anchors.flatMap((anchor) => (anchor.kind === "span" ? [anchor.spanId] : [])),
    )

    expect(failures).toHaveLength(2)
    expect(anchoredSpanIds).toEqual(expect.arrayContaining([contentFailedCall.spanId, statusFailedCall.spanId]))
  })

  it("matches reused-ID content failures to their originating trace", async () => {
    const laterTraceId = TraceId("u".repeat(32))
    const contentFailedCall = toolCall("y", "call-reused", 0, 10)
    const laterStatusFailure = toolCall("z", "call-reused", 11, 20, {
      traceId: laterTraceId,
      statusCode: "error",
      statusMessage: "transport failure",
    })
    const value = session([
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "call-reused", name: "search", arguments: { q: "first" } }],
      },
      {
        role: "tool",
        parts: [{ type: "tool_call_response", id: "call-reused", response: { error: "invalid response" } }],
      },
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "call-reused", name: "search", arguments: { q: "retry" } }],
      },
      {
        role: "tool",
        parts: [{ type: "tool_call_response", id: "call-reused", response: { results: ["found"] } }],
      },
      { role: "assistant", parts: [{ type: "text", content: "Found it" }] },
    ])
    const result = await read({ ...value, traceIds: [traceId, laterTraceId] }, [], {
      toolCalls: [contentFailedCall, laterStatusFailure],
    })
    const failures = result.findings.filter((finding) => finding.kind === "toolFailure")
    const anchoredSpans = failures.flatMap((finding) =>
      finding.anchors.flatMap((anchor) =>
        anchor.kind === "span" ? [{ traceId: anchor.traceId, spanId: anchor.spanId }] : [],
      ),
    )

    expect(failures).toHaveLength(2)
    expect(anchoredSpans).toEqual(
      expect.arrayContaining([
        { traceId, spanId: contentFailedCall.spanId },
        { traceId: laterTraceId, spanId: laterStatusFailure.spanId },
      ]),
    )
  })

  it("keeps a final failed tool call terminal when no successful progress follows", async () => {
    const failedCall = toolCall("p", "call-terminal-status", 0, 10, {
      statusCode: "error",
      statusMessage: "upstream unavailable",
    })
    const result = await read(
      session([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-terminal-status", name: "search", arguments: {} }],
        },
      ]),
      [],
      { toolCalls: [failedCall] },
    )

    expect(result.findings.find((finding) => finding.kind === "usableCompletion")).toBeDefined()
    expect(result.findings.find((finding) => finding.kind === "toolFailure")).toMatchObject({
      recovered: false,
      sameSubjectRecovered: false,
      terminal: true,
    })
    expect(
      resolveSessionAssessment(result).dimensions.find((summary) => summary.scoreDimension === "reliability"),
    ).toMatchObject({ unrecoveredIncidentCount: 1 })
  })

  it("counts a tool retried in place, with no generation between the failure and the retry", async () => {
    const failedCall = toolCall("q", "", 0, 10, { statusCode: "error", statusMessage: "503 upstream unavailable" })
    const retryCall = toolCall("r", "", 11, 20)
    const result = await read(session([{ role: "assistant", parts: [{ type: "text", content: "Done" }] }]), [], {
      toolCalls: [failedCall, retryCall],
    })

    expect(result.findings.filter((finding) => finding.kind === "toolFailure")).toHaveLength(1)
    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "recovery.recovered_incident_rate"),
    ).toMatchObject({ adverseUnits: 1 })
  })

  it("counts a successful different-tool fallback as recovery", async () => {
    const failedCall = toolCall("d", "call-primary", 0, 10, {
      statusCode: "error",
      statusMessage: "upstream unavailable",
    })
    const fallbackCall = toolCall("e", "call-fallback", 11, 20, {
      toolName: "cached_search",
      normalizedToolName: "cached_search",
    })
    const root = generation("c", 0, 40, {
      parentSpanId: "",
      operation: "invoke_agent",
      provider: "",
      model: "",
      costTotalMicrocents: 0,
      pricingState: "notSpendBearing",
    })
    const failedToolSpan = generation("d", 0, 10, {
      parentSpanId: root.spanId,
      operation: "execute_tool",
      statusCode: "error",
      costTotalMicrocents: 0,
      pricingState: "notSpendBearing",
    })
    const fallbackToolSpan = generation("e", 11, 20, {
      parentSpanId: root.spanId,
      operation: "execute_tool",
      costTotalMicrocents: 200,
    })
    const laterAnswer = generation("f", 21, 30, {
      parentSpanId: root.spanId,
      costTotalMicrocents: 500,
    })
    const result = await read(session([{ role: "assistant", parts: [{ type: "text", content: "Done" }] }]), [], {
      generations: [root, failedToolSpan, fallbackToolSpan, laterAnswer],
      toolCalls: [failedCall, fallbackCall],
    })

    expect(result.findings.find((finding) => finding.kind === "toolFailure")).toMatchObject({
      recovered: true,
      sameSubjectRecovered: false,
      terminal: false,
    })
    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "recovery.recovered_incident_rate"),
    ).toMatchObject({ adverseUnits: 1 })
    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "cost.recoverable_spend_share"),
    ).toMatchObject({
      adverseUnits: 200,
      observations: [expect.objectContaining({ atomId: `generation:${traceId}:${fallbackToolSpan.spanId}` })],
    })
    expect(result.costEvidence).toMatchObject({
      measuredAvoidableNs: 9_000_000,
      avoidableNsByCause: { "recovered:toolFailure": 9_000_000 },
    })
  })

  it("stops tool recovery attribution at an earlier successful generation", async () => {
    const failedCall = toolCall("d", "call-primary", 0, 10, {
      statusCode: "error",
      statusMessage: "upstream unavailable",
    })
    const laterToolCall = toolCall("f", "call-later-tool", 21, 30)
    const recoveredAnswer = generation("e", 11, 20, { costTotalMicrocents: 200 })
    const laterToolSpan = generation("f", 21, 30, {
      operation: "execute_tool",
      costTotalMicrocents: 500,
    })
    const result = await read(session([{ role: "assistant", parts: [{ type: "text", content: "Done" }] }]), [], {
      generations: [recoveredAnswer, laterToolSpan],
      toolCalls: [failedCall, laterToolCall],
    })

    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "cost.recoverable_spend_share"),
    ).toMatchObject({
      adverseUnits: 200,
      observations: [expect.objectContaining({ atomId: `generation:${traceId}:${recoveredAnswer.spanId}` })],
    })
  })

  it("uses the first completed recovery when tool and generation retries overlap", async () => {
    const failedCall = toolCall("d", "call-primary", 0, 10, {
      statusCode: "error",
      statusMessage: "upstream unavailable",
    })
    const fallbackCall = toolCall("f", "call-fast-fallback", 20, 30)
    const slowAnswer = generation("e", 11, 100, { costTotalMicrocents: 500 })
    const fallbackToolSpan = generation("f", 20, 30, {
      operation: "execute_tool",
      costTotalMicrocents: 200,
    })
    const result = await read(session([{ role: "assistant", parts: [{ type: "text", content: "Done" }] }]), [], {
      generations: [slowAnswer, fallbackToolSpan],
      toolCalls: [failedCall, fallbackCall],
    })

    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "cost.recoverable_spend_share"),
    ).toMatchObject({
      adverseUnits: 200,
      observations: [expect.objectContaining({ atomId: `generation:${traceId}:${fallbackToolSpan.spanId}` })],
    })
  })

  it("does not treat a tool call with unset status as a successful retry", async () => {
    const failedCall = toolCall("u", "", 0, 10, { statusCode: "error", statusMessage: "upstream unavailable" })
    const unexaminedCall = toolCall("v", "", 11, 20, { statusCode: "unset" })
    const result = await read(session([{ role: "assistant", parts: [{ type: "text", content: "Done" }] }]), [], {
      toolCalls: [failedCall, unexaminedCall],
    })

    expect(result.findings.find((finding) => finding.kind === "toolFailure")).toMatchObject({
      sameSubjectRecovered: false,
    })
    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "recovery.recovered_incident_rate"),
    ).toMatchObject({ adverseUnits: 0 })
  })

  it("does not read a tool call whose instrumentation set no status as examined", async () => {
    const result = await read(session([{ role: "assistant", parts: [{ type: "text", content: "Done" }] }]), [], {
      toolCalls: [toolCall("s", "call-unset", 0, 10, { statusCode: "unset" })],
    })

    expect(result.readers.find((reader) => reader.readerId === "tools.call_status")).toMatchObject({
      applicable: true,
      findingCount: 0,
      readableCount: 0,
      totalCount: 1,
      limitation: "missingTelemetry",
    })
  })

  it("resolves a recovered structural defect to the matching tool span", async () => {
    const original = toolCall("j", "call-duplicate", 0, 10)
    const duplicate = toolCall("k", "call-duplicate", 11, 20)
    const result = await read(
      session([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-duplicate", name: "search", arguments: { q: "first" } }],
        },
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-duplicate", name: "search", arguments: { q: "second" } }],
        },
        { role: "assistant", parts: [{ type: "text", content: "Completed" }] },
      ]),
      [],
      { toolCalls: [original, duplicate] },
    )

    expect(
      result.costEvidence?.readings.find((reading) => reading.metricId === "tools.structural_defect"),
    ).toMatchObject({
      adverseUnits: 1,
      observations: expect.arrayContaining([
        expect.objectContaining({ atomId: `toolCall:${traceId}:${duplicate.spanId}`, adverseUnits: 1 }),
      ]),
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

  describe("task-outcome verdicts", () => {
    const ANALYSIS_HASH = "a".repeat(64)

    const verdictScore = (passed: boolean): Score =>
      ({
        ...score("score-task-failure", "signal-unused"),
        signalId: null,
        passed,
        value: passed ? 1 : 0,
        feedback: passed ? "Cancelled the subscription and confirmed the date." : "The cancellation never happened.",
        metadata: {
          rawFeedback: "raw",
          flaggerSlug: "task-failure",
          flaggerPath: "sampled",
          scoringArtifactVersion: "task-failure-v1:amazon-bedrock/anthropic.claude-haiku-4-5",
          analysisHash: ANALYSIS_HASH,
          messageIndex: 0,
        },
      }) as Score

    const judgeDecision = (
      outcome: FlaggerScreeningDecision["outcome"],
      overrides: Partial<FlaggerScreeningDecision> = {},
    ): FlaggerScreeningDecision =>
      ({
        decisionId: "d".repeat(64),
        organizationId,
        projectId,
        sessionId,
        flaggerSlug: "task-failure",
        analysisHash: ANALYSIS_HASH,
        scoringArtifactVersion: "flagger-screening-v1",
        attempt: 1,
        version: 2,
        selected: true,
        reason: "ordinary-sample",
        inclusionProbability: 0.1,
        hintKinds: [],
        outcome,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        retentionDays: 90,
        ...overrides,
      }) satisfies FlaggerScreeningDecision

    const judged = (passed: boolean, outcome: FlaggerScreeningDecision["outcome"]) =>
      read(session([{ role: "assistant", parts: [{ type: "text", content: "Cancelled" }] }]), [], {
        scores: [verdictScore(passed)],
        screeningDecisions: [judgeDecision(outcome)],
      })

    const taskOutcomeItem = (resolved: ReturnType<typeof resolveSessionAssessment>) =>
      resolved.items.find((item) => item.metricId === "sessions.task_success")

    it("renders a success as positive Outcome evidence with the judge's own words", async () => {
      const resolved = resolveSessionAssessment(await judged(true, "success"))
      const item = taskOutcomeItem(resolved)

      expect(item).toMatchObject({
        label: "Task failure",
        description: "Cancelled the subscription and confirmed the date.",
        polarity: "positive",
        source: "flagger",
        scoreIds: ["score-task-failure"],
      })
      expect(item?.effects).toEqual([
        expect.objectContaining({
          scoreDimension: "outcome",
          role: "taskOutcome",
          direction: "positive",
          impact: { kind: "taskOutcome", verdict: "success" },
        }),
      ])
      expect(item?.anchors).toContainEqual(expect.objectContaining({ kind: "message", messageIndex: 0 }))
    })

    it("renders a failure as negative Outcome evidence", async () => {
      const resolved = resolveSessionAssessment(await judged(false, "failure"))

      expect(taskOutcomeItem(resolved)).toMatchObject({ polarity: "negative", impactLevel: "high" })
      expect(taskOutcomeItem(resolved)?.effects[0]).toMatchObject({
        direction: "negative",
        impact: { kind: "taskOutcome", verdict: "failure" },
      })
    })

    // The judge writes no score for these two, so the only place they can show
    // up is coverage. An item would claim a verdict nobody reached.
    it.each(["indeterminate", "notApplicable"] as const)("keeps %s out of the evidence list", async (outcome) => {
      const resolved = resolveSessionAssessment(
        await read(session([{ role: "assistant", parts: [{ type: "text", content: "Cancelled" }] }]), [], {
          screeningDecisions: [judgeDecision(outcome)],
        }),
      )

      expect(taskOutcomeItem(resolved)).toBeUndefined()
      expect(resolved.coverage.readers).toContainEqual(
        expect.objectContaining({
          readerId: "flagger:task-failure",
          scoreDimensions: ["outcome"],
          status: outcome === "notApplicable" ? "notApplicable" : "notExamined",
        }),
      )
    })

    it("reports a session the judge never examined as unexamined rather than clean", async () => {
      const resolved = resolveSessionAssessment(
        await read(session([{ role: "assistant", parts: [{ type: "text", content: "Cancelled" }] }]), [], {
          screeningDecisions: [judgeDecision(undefined, { selected: false })],
        }),
      )
      const outcome = resolved.dimensions.find((dimension) => dimension.scoreDimension === "outcome")

      expect(taskOutcomeItem(resolved)).toBeUndefined()
      expect(resolved.coverage.readers).toContainEqual(
        expect.objectContaining({
          readerId: "flagger:task-failure",
          status: "notExamined",
          limitation: "notSelected",
          selection: { method: "ordinary-sample", inclusionProbability: 0.1 },
        }),
      )
      // The deterministic Outcome readers did run, so the dimension is partly
      // covered; what must never happen is a verdict appearing without a judge.
      expect(outcome?.coverage).toBe("partial")
      expect(outcome).not.toHaveProperty("taskOutcome")
    })
  })

  describe("Safety findings", () => {
    const SAFETY_ANALYSIS_HASH = "b".repeat(64)

    const safetyScore = (findingKind: SafetyFindingKind, passed: boolean): Score =>
      ({
        ...score("score-safety", "signal-unused"),
        signalId: null,
        passed,
        value: passed ? 1 : 0,
        feedback: "An instruction-override attempt arrived in the first user turn.",
        metadata: {
          rawFeedback: "raw",
          flaggerSlug: "jailbreaking",
          flaggerPath: "sampled",
          scoringArtifactVersion: "safety-v1:amazon-bedrock/anthropic.claude-haiku-4-5",
          analysisHash: SAFETY_ANALYSIS_HASH,
          safetyFindingKind: findingKind,
          messageIndex: 0,
        },
      }) as Score

    const safetyDecision = (
      outcome: FlaggerScreeningDecision["outcome"],
      overrides: Partial<FlaggerScreeningDecision> = {},
    ): FlaggerScreeningDecision =>
      ({
        decisionId: "e".repeat(64),
        organizationId,
        projectId,
        sessionId,
        flaggerSlug: "jailbreaking",
        analysisHash: SAFETY_ANALYSIS_HASH,
        scoringArtifactVersion: "flagger-screening-v1",
        attempt: 1,
        version: 2,
        selected: true,
        reason: "ordinary-sample",
        inclusionProbability: 0.1,
        hintKinds: [],
        outcome,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        retentionDays: 90,
        ...overrides,
      }) satisfies FlaggerScreeningDecision

    const examined = (findingKind: SafetyFindingKind, passed: boolean, outcome: FlaggerScreeningDecision["outcome"]) =>
      read(session([{ role: "assistant", parts: [{ type: "text", content: "I can't do that." }] }]), [], {
        scores: [safetyScore(findingKind, passed)],
        screeningDecisions: [safetyDecision(outcome)],
      })

    const safetyDimension = (resolved: ReturnType<typeof resolveSessionAssessment>) =>
      resolved.dimensions.find((dimension) => dimension.scoreDimension === "safety")

    it("renders confirmed harm under needs attention and counts the attack beside it", async () => {
      const resolved = resolveSessionAssessment(await examined("injectionCompliance", false, "matched"))
      const item = resolved.items.find((candidate) => candidate.scoreIds.includes("score-safety"))

      expect(item).toMatchObject({ label: "Jailbreaking", polarity: "negative", source: "flagger" })
      expect(safetyDimension(resolved)).toMatchObject({ confirmedHarmCount: 1, exposureCount: 1 })
      expect(item?.anchors).toContainEqual(expect.objectContaining({ kind: "message", messageIndex: 0 }))
    })

    it("renders a successful defense as positive evidence", async () => {
      const resolved = resolveSessionAssessment(await examined("injectionDefense", true, "success"))
      const item = resolved.items.find((candidate) => candidate.scoreIds.includes("score-safety"))

      expect(item).toMatchObject({ polarity: "positive" })
      expect(safetyDimension(resolved)).toMatchObject({
        successfulDefenseCount: 1,
        exposureCount: 1,
        confirmedHarmCount: 0,
      })
    })

    it("keeps user-authored personal data out of the harm count", async () => {
      const resolved = resolveSessionAssessment(await examined("piiExposure", true, "success"))

      expect(safetyDimension(resolved)).toMatchObject({ exposureCount: 1, confirmedHarmCount: 0 })
    })

    // An examined session with nothing to report is not positive evidence, and
    // an unexamined one is not a clean result either.
    it("produces no item for an examined session with no finding", async () => {
      const resolved = resolveSessionAssessment(
        await read(session([{ role: "assistant", parts: [{ type: "text", content: "Sure." }] }]), [], {
          screeningDecisions: [safetyDecision("unmatched")],
        }),
      )

      expect(resolved.items.some((item) => item.scoreIds.includes("score-safety"))).toBe(false)
      expect(safetyDimension(resolved)).toMatchObject({ exposureCount: 0, confirmedHarmCount: 0 })
      expect(resolved.coverage.readers).toContainEqual(
        expect.objectContaining({ readerId: "flagger:jailbreaking", status: "examined" }),
      )
    })

    it("reports a session the suite never examined as unexamined", async () => {
      const resolved = resolveSessionAssessment(
        await read(session([{ role: "assistant", parts: [{ type: "text", content: "Sure." }] }]), [], {
          screeningDecisions: [safetyDecision(undefined, { selected: false })],
        }),
      )

      expect(resolved.coverage.readers).toContainEqual(
        expect.objectContaining({
          readerId: "flagger:jailbreaking",
          status: "notExamined",
          limitation: "notSelected",
          selection: { method: "ordinary-sample", inclusionProbability: 0.1 },
        }),
      )
    })
  })
})

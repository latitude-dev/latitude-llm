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
      observations: [expect.objectContaining({ atomId: `generation:${successful.spanId}` })],
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

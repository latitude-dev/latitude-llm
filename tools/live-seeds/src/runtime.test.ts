import type { AnnotationQueue } from "@domain/annotation-queues"
import type { Evaluation } from "@domain/evaluations"
import {
  SEED_ACCESS_EVALUATION_ID,
  SEED_API_KEY_TOKEN,
  SEED_COMBINATION_EVALUATION_ID,
  SEED_EVALUATION_ID,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_PROJECT_SLUG,
  SEED_RETURNS_EVALUATION_ID,
} from "@domain/shared/seeding"
import { afterEach, describe, expect, it, vi } from "vitest"
import { warrantyEvalInFixture } from "./fixtures/warranty-eval-in.ts"
import {
  assistantTextMessage,
  type OtlpExportTraceServiceRequest,
  type SeedSpanDefinition,
  userTextMessage,
} from "./otlp.ts"
import {
  buildLiveSeedRunPlan,
  dispatchResolvedCases,
  type ResolvedLiveSeedCase,
  type SeedRunContext,
  type SeedTargets,
} from "./runtime.ts"

const defaultRunContext: SeedRunContext = {
  organizationId: SEED_ORG_ID,
  projectId: SEED_PROJECT_ID,
  projectSlug: SEED_PROJECT_SLUG,
  apiKeyToken: SEED_API_KEY_TOKEN,
  systemQueuesOnly: false,
}

function createSeedTargets(): SeedTargets {
  return {
    evaluationsById: {
      [SEED_EVALUATION_ID]: {
        id: SEED_EVALUATION_ID,
        trigger: { sampling: 20 },
      } as unknown as Evaluation,
      [SEED_COMBINATION_EVALUATION_ID]: {
        id: SEED_COMBINATION_EVALUATION_ID,
        trigger: { sampling: 35 },
      } as unknown as Evaluation,
      [SEED_RETURNS_EVALUATION_ID]: {
        id: SEED_RETURNS_EVALUATION_ID,
        trigger: { sampling: 15 },
      } as unknown as Evaluation,
      [SEED_ACCESS_EVALUATION_ID]: {
        id: SEED_ACCESS_EVALUATION_ID,
        trigger: { sampling: 10 },
      } as unknown as Evaluation,
    },
    highCostLiveQueue: {
      id: "high-cost-live-queue",
      slug: "high-cost-traces",
      settings: { sampling: 25 },
    } as unknown as AnnotationQueue,
    systemQueuesBySlug: {
      frustration: {
        id: "system-frustration",
        slug: "frustration",
        settings: { sampling: 10 },
      } as unknown as AnnotationQueue,
      "tool-call-errors": {
        id: "system-tool-call-errors",
        slug: "tool-call-errors",
        settings: { sampling: 100 },
      } as unknown as AnnotationQueue,
      "empty-response": {
        id: "system-empty-response",
        slug: "empty-response",
        settings: { sampling: 100 },
      } as unknown as AnnotationQueue,
      "output-schema-validation": {
        id: "system-output-schema",
        slug: "output-schema-validation",
        settings: { sampling: 100 },
      } as unknown as AnnotationQueue,
    },
  }
}

function createChatSpan(label: string, offsetMs: number, durationMs: number, parentLabel?: string): SeedSpanDefinition {
  return {
    type: "chat",
    label,
    offsetMs,
    durationMs,
    ...(parentLabel === undefined ? {} : { parentLabel }),
    inputMessages: [userTextMessage(`input-${label}`)],
    outputMessages: [assistantTextMessage(`output-${label}`)],
    usage: {
      inputTokens: 12,
      outputTokens: 10,
      totalCostUsd: 0.0000007,
    },
  }
}

function createEmptyPreview() {
  return {
    evaluationsById: {
      [SEED_EVALUATION_ID]: false,
      [SEED_COMBINATION_EVALUATION_ID]: false,
      [SEED_RETURNS_EVALUATION_ID]: false,
      [SEED_ACCESS_EVALUATION_ID]: false,
    },
    liveQueue: false,
    systemQueuesBySlug: {
      frustration: false,
      "tool-call-errors": false,
      "empty-response": false,
      "output-schema-validation": false,
    },
  } as const
}

function createResolvedCase(input: {
  readonly caseIndex: number
  readonly traces: readonly {
    readonly traceId: string
    readonly key: string
    readonly role?: "target" | "context"
    readonly startDelayMs: number
    readonly spans: readonly SeedSpanDefinition[]
    readonly serviceName?: string
  }[]
}): ResolvedLiveSeedCase {
  const sessionId = `session-${input.caseIndex.toString()}`
  const userId = `user-${input.caseIndex.toString()}`

  return {
    fixture: warrantyEvalInFixture,
    caseIndex: input.caseIndex,
    sessionId,
    userId,
    traces: input.traces.map((trace, traceIndex) => ({
      fixture: warrantyEvalInFixture,
      caseIndex: input.caseIndex,
      traceIndex,
      sessionId,
      userId,
      traceId: trace.traceId,
      generatedTrace: {
        key: trace.key,
        role: trace.role ?? (traceIndex === 0 ? "target" : "context"),
        startDelayMs: trace.startDelayMs,
        serviceName: trace.serviceName ?? "acme-support-agent",
        systemInstructions: [{ type: "text", content: "Test system prompt" }],
        spans: trace.spans,
      },
      samples: createEmptyPreview(),
    })),
  }
}

describe("buildLiveSeedRunPlan", () => {
  it("expands fixtures into reproducible cases and only enforces sampling on the target trace", async () => {
    const targets = createSeedTargets()
    const planA = await buildLiveSeedRunPlan({
      fixtureKeys: ["warranty-eval-in", "tool-call-error"],
      countPerFixture: 2,
      timeScale: 1,
      seed: "repeatable-seed",
      targets,
      ctx: defaultRunContext,
    })
    const planB = await buildLiveSeedRunPlan({
      fixtureKeys: ["warranty-eval-in", "tool-call-error"],
      countPerFixture: 2,
      timeScale: 1,
      seed: "repeatable-seed",
      targets,
      ctx: defaultRunContext,
    })

    const summarize = (plan: Awaited<ReturnType<typeof buildLiveSeedRunPlan>>) =>
      plan.cases.map((seedCase) => ({
        fixtureKey: seedCase.fixture.key,
        caseIndex: seedCase.caseIndex,
        sessionId: seedCase.sessionId,
        traces: seedCase.traces.map((trace) => ({
          traceIndex: trace.traceIndex,
          traceId: trace.traceId,
          generatedTrace: trace.generatedTrace,
          samples: trace.samples,
        })),
      }))

    expect(planA.runId).toBe(planB.runId)
    expect(planA.cases).toHaveLength(4)
    expect(summarize(planA)).toEqual(summarize(planB))

    const warrantyCase = planA.cases.find((seedCase) => seedCase.fixture.key === "warranty-eval-in")
    expect(warrantyCase).toBeDefined()

    if (!warrantyCase) {
      return
    }

    expect(warrantyCase.traces.length).toBeGreaterThan(1)
    expect(warrantyCase.traces.filter((trace) => trace.generatedTrace.role === "target")).toHaveLength(1)
    expect(new Set(warrantyCase.traces.map((trace) => trace.sessionId)).size).toBe(1)

    const targetTrace = warrantyCase.traces.find((trace) => trace.generatedTrace.role === "target")
    const contextTraces = warrantyCase.traces.filter((trace) => trace.generatedTrace.role === "context")

    expect(targetTrace?.samples.evaluationsById[SEED_EVALUATION_ID]).toBe(true)
    expect(targetTrace?.samples.evaluationsById[SEED_COMBINATION_EVALUATION_ID]).toBe(false)
    expect(targetTrace?.samples.evaluationsById[SEED_RETURNS_EVALUATION_ID]).toBe(false)
    expect(targetTrace?.samples.evaluationsById[SEED_ACCESS_EVALUATION_ID]).toBe(false)
    expect(contextTraces.length).toBeGreaterThan(0)

    for (const contextTrace of contextTraces) {
      expect(Object.values(contextTrace.samples.evaluationsById).every((sampled) => !sampled)).toBe(true)
      expect(contextTrace.samples.liveQueue).toBe(false)
      expect(contextTrace.samples.systemQueuesBySlug.frustration).toBe(false)
    }
  })
})

describe("dispatchResolvedCases", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("preserves per-case, per-trace, and per-span timing while allowing parallel cases", async () => {
    vi.useFakeTimers()
    const baseTime = new Date("2026-04-14T00:00:00.000Z")
    vi.setSystemTime(baseTime)

    const calls: Array<{ readonly atMs: number; readonly traceId: string; readonly label: string }> = []
    const cases = [
      createResolvedCase({
        caseIndex: 0,
        traces: [
          {
            traceId: "trace-a1",
            key: "opening",
            role: "target",
            startDelayMs: 0,
            spans: [createChatSpan("a-1", 0, 100), createChatSpan("a-2", 150, 100)],
          },
          {
            traceId: "trace-a2",
            key: "follow-up",
            role: "context",
            startDelayMs: 400,
            spans: [createChatSpan("a-3", 0, 50)],
          },
        ],
      }),
      createResolvedCase({
        caseIndex: 1,
        traces: [
          {
            traceId: "trace-b1",
            key: "target",
            startDelayMs: 0,
            spans: [createChatSpan("b-1", 0, 50)],
          },
        ],
      }),
    ] as const

    const dispatchPromise = dispatchResolvedCases(cases, {
      ingestBaseUrl: "http://127.0.0.1:3002",
      parallelCases: 2,
      runId: "dispatch-parallel-cases",
      postTraceSpan: async ({ trace, span }) => {
        calls.push({
          atMs: Date.now() - baseTime.getTime(),
          traceId: trace.traceId,
          label: span.label,
        })
      },
    })

    await vi.runAllTimersAsync()
    const result = await dispatchPromise

    expect(calls).toEqual([
      { atMs: 50, traceId: "trace-b1", label: "b-1" },
      { atMs: 100, traceId: "trace-a1", label: "a-1" },
      { atMs: 250, traceId: "trace-a1", label: "a-2" },
      { atMs: 450, traceId: "trace-a2", label: "a-3" },
    ])
    expect(result.sentCaseCount).toBe(2)
    expect(result.sentTraceCount).toBe(3)
    expect(result.sentSpanCount).toBe(4)
  })

  it("enriches span tags and metadata using seed-style context only", async () => {
    vi.useFakeTimers()
    const baseTime = new Date("2026-04-14T00:00:00.000Z")
    vi.setSystemTime(baseTime)

    const capturedRequests: unknown[] = []
    const cases = [
      createResolvedCase({
        caseIndex: 0,
        traces: [
          {
            traceId: "trace-seed-context",
            key: "target",
            startDelayMs: 0,
            spans: [createChatSpan("seed-context", 0, 100)],
          },
        ],
      }),
    ] as const

    const dispatchPromise = dispatchResolvedCases(cases, {
      ingestBaseUrl: "http://127.0.0.1:3002",
      parallelCases: 1,
      runId: "dispatch-seed-context",
      postTraceSpan: async ({ span }) => {
        capturedRequests.push(span.request)
      },
    })

    await vi.runAllTimersAsync()
    await dispatchPromise

    const request = capturedRequests[0] as OtlpExportTraceServiceRequest
    const attributes = request.resourceSpans[0]?.scopeSpans[0]?.spans[0]?.attributes ?? []
    const tagsAttr = attributes.find((attribute) => attribute.key === "langfuse.trace.tags")
    const tagValues = tagsAttr?.value.arrayValue?.values?.map((value) => value.stringValue).filter(Boolean)
    const metadataEntries = Object.fromEntries(
      attributes
        .filter((attribute) => attribute.key.startsWith("langfuse.trace.metadata."))
        .map((attribute) => [attribute.key.replace("langfuse.trace.metadata.", ""), attribute.value.stringValue ?? ""]),
    )

    expect(tagValues).toContain("support")
    expect(tagValues).toContain("live-seed")
    expect(tagValues).toHaveLength(3)
    expect(metadataEntries.live_seed_fixture).toBe("warranty-eval-in")
    expect(metadataEntries.environment).toBeDefined()
    expect(metadataEntries.sdk_version).toBeDefined()
    expect(metadataEntries.runId).toBeUndefined()
    expect(metadataEntries.fixture).toBeUndefined()
    expect(metadataEntries.expectation).toBeUndefined()
  })

  it("emits valid wrapper and sibling parentage for multi-span workflow traces", async () => {
    vi.useFakeTimers()
    const baseTime = new Date("2026-04-14T00:00:00.000Z")
    vi.setSystemTime(baseTime)

    const capturedSpans: Array<{
      readonly label: string
      readonly spanId: string
      readonly parentSpanId?: string
    }> = []
    const cases = [
      createResolvedCase({
        caseIndex: 0,
        traces: [
          {
            traceId: "trace-workflow",
            key: "target",
            startDelayMs: 0,
            spans: [
              {
                type: "wrapper",
                label: "invoke-agent",
                offsetMs: 0,
                durationMs: 400,
                name: "invoke_agent acme-support-agent",
                operation: "invoke_agent",
              },
              createChatSpan("plan-chat", 0, 100, "invoke-agent"),
              {
                type: "tool",
                label: "tool-step",
                parentLabel: "invoke-agent",
                offsetMs: 100,
                durationMs: 150,
                toolName: "lookup_policy",
                toolCallId: "call_123",
                toolInput: { query: "policy" },
                toolOutput: { status: "error" },
              },
              createChatSpan("final-chat", 250, 100, "invoke-agent"),
            ],
          },
        ],
      }),
    ] as const

    const dispatchPromise = dispatchResolvedCases(cases, {
      ingestBaseUrl: "http://127.0.0.1:3002",
      parallelCases: 1,
      runId: "dispatch-topology",
      postTraceSpan: async ({ span }) => {
        const otlpSpan = span.request.resourceSpans[0]?.scopeSpans[0]?.spans[0]
        if (otlpSpan) {
          capturedSpans.push({
            label: span.label,
            spanId: otlpSpan.spanId,
            ...(otlpSpan.parentSpanId === undefined ? {} : { parentSpanId: otlpSpan.parentSpanId }),
          })
        }
      },
    })

    await vi.runAllTimersAsync()
    await dispatchPromise

    const wrapper = capturedSpans.find((span) => span.label === "invoke-agent")
    const planChat = capturedSpans.find((span) => span.label === "plan-chat")
    const toolStep = capturedSpans.find((span) => span.label === "tool-step")
    const finalChat = capturedSpans.find((span) => span.label === "final-chat")

    expect(wrapper).toBeDefined()
    expect(planChat?.parentSpanId).toBe(wrapper?.spanId)
    expect(toolStep?.parentSpanId).toBe(wrapper?.spanId)
    expect(finalChat?.parentSpanId).toBe(wrapper?.spanId)
    expect(finalChat?.parentSpanId).not.toBe(planChat?.spanId)
  })

  it("logs case and trace progress by default and span details only in verbose mode", async () => {
    vi.useFakeTimers()
    const baseTime = new Date("2026-04-14T00:00:00.000Z")
    vi.setSystemTime(baseTime)

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const cases = [
      createResolvedCase({
        caseIndex: 0,
        traces: [
          {
            traceId: "trace-log-a",
            key: "target",
            startDelayMs: 0,
            spans: [createChatSpan("a-1", 0, 100), createChatSpan("a-2", 150, 100)],
          },
        ],
      }),
    ] as const

    const summaryDispatchPromise = dispatchResolvedCases(cases, {
      ingestBaseUrl: "http://127.0.0.1:3002",
      parallelCases: 1,
      runId: "dispatch-summary-logs",
      postTraceSpan: async () => {},
    })

    await vi.runAllTimersAsync()
    await summaryDispatchPromise

    const summaryMessages = logSpy.mock.calls.map(([message]) => String(message))
    expect(summaryMessages.some((message) => message.startsWith("[trace] completed"))).toBe(true)
    expect(summaryMessages.some((message) => message.startsWith("[case] completed"))).toBe(true)
    expect(summaryMessages.some((message) => message.startsWith("[progress]"))).toBe(true)
    expect(summaryMessages.some((message) => message.startsWith("[span]"))).toBe(false)

    logSpy.mockClear()

    const verboseDispatchPromise = dispatchResolvedCases(cases, {
      ingestBaseUrl: "http://127.0.0.1:3002",
      parallelCases: 1,
      runId: "dispatch-verbose-logs",
      verboseSpans: true,
      postTraceSpan: async () => {},
    })

    await vi.runAllTimersAsync()
    await verboseDispatchPromise

    const verboseMessages = logSpy.mock.calls.map(([message]) => String(message))
    expect(verboseMessages.some((message) => message.startsWith("[span]"))).toBe(true)
  })
})

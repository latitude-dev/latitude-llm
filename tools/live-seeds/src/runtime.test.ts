import type { AnnotationQueue } from "@domain/annotation-queues"
import type { Evaluation } from "@domain/evaluations"
import {
  SEED_ACCESS_EVALUATION_ID,
  SEED_COMBINATION_EVALUATION_ID,
  SEED_EVALUATION_ID,
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
  dispatchResolvedTraces,
  type ResolvedLiveSeedTrace,
  type SeedTargets,
} from "./runtime.ts"

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

function createSpan(label: string, offsetMs: number, durationMs: number): SeedSpanDefinition {
  return {
    label,
    offsetMs,
    durationMs,
    inputMessages: [userTextMessage(`input-${label}`)],
    outputMessages: [assistantTextMessage(`output-${label}`)],
    usage: {
      inputTokens: 12,
      outputTokens: 10,
      totalCostUsd: 0.0000007,
    },
  }
}

function createResolvedTrace(input: {
  readonly traceId: string
  readonly instanceIndex: number
  readonly startDelayMs: number
  readonly spans: readonly SeedSpanDefinition[]
}): ResolvedLiveSeedTrace {
  return {
    fixture: warrantyEvalInFixture,
    instanceIndex: input.instanceIndex,
    traceId: input.traceId,
    generatedTrace: {
      startDelayMs: input.startDelayMs,
      sessionId: `session-${input.traceId}`,
      userId: `user-${input.traceId}`,
      serviceName: "acme-support-agent",
      systemInstructions: [{ type: "text", content: "Test system prompt" }],
      spans: input.spans,
    },
    samples: {
      evaluations: {
        warranty: false,
        combination: false,
        returns: false,
        access: false,
      },
    },
  }
}

describe("buildLiveSeedRunPlan", () => {
  it("expands fixtures by count and stays reproducible for a fixed seed", async () => {
    const targets = createSeedTargets()
    const planA = await buildLiveSeedRunPlan({
      fixtureKeys: ["warranty-eval-in", "tool-call-error"],
      countPerFixture: 2,
      timeScale: 1,
      seed: "repeatable-seed",
      targets,
    })
    const planB = await buildLiveSeedRunPlan({
      fixtureKeys: ["warranty-eval-in", "tool-call-error"],
      countPerFixture: 2,
      timeScale: 1,
      seed: "repeatable-seed",
      targets,
    })

    const summarize = (plan: Awaited<ReturnType<typeof buildLiveSeedRunPlan>>) =>
      plan.traces.map((trace) => ({
        fixtureKey: trace.fixture.key,
        instanceIndex: trace.instanceIndex,
        traceId: trace.traceId,
        generatedTrace: trace.generatedTrace,
        samples: trace.samples,
      }))

    expect(planA.runId).toBe(planB.runId)
    expect(planA.traces).toHaveLength(4)
    expect(new Set(planA.traces.map((trace) => trace.traceId)).size).toBe(4)
    expect(summarize(planA)).toEqual(summarize(planB))

    const warrantyTraces = planA.traces.filter((trace) => trace.fixture.key === "warranty-eval-in")
    expect(warrantyTraces).toHaveLength(2)
    expect(JSON.stringify(warrantyTraces[0]?.generatedTrace.spans)).not.toBe(
      JSON.stringify(warrantyTraces[1]?.generatedTrace.spans),
    )
  })
})

describe("dispatchResolvedTraces", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("sends spans sequentially within each trace when only one runner is allowed", async () => {
    vi.useFakeTimers()
    const baseTime = new Date("2026-04-14T00:00:00.000Z")
    vi.setSystemTime(baseTime)

    const calls: Array<{ readonly atMs: number; readonly traceId: string; readonly label: string }> = []
    const traces = [
      createResolvedTrace({
        traceId: "trace-a",
        instanceIndex: 0,
        startDelayMs: 0,
        spans: [createSpan("a-1", 0, 100), createSpan("a-2", 150, 100)],
      }),
      createResolvedTrace({
        traceId: "trace-b",
        instanceIndex: 1,
        startDelayMs: 0,
        spans: [createSpan("b-1", 0, 50)],
      }),
    ] as const

    const dispatchPromise = dispatchResolvedTraces(traces, {
      ingestBaseUrl: "http://127.0.0.1:3002",
      parallelTraces: 1,
      runId: "dispatch-sequential",
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
      { atMs: 100, traceId: "trace-a", label: "a-1" },
      { atMs: 250, traceId: "trace-a", label: "a-2" },
      { atMs: 300, traceId: "trace-b", label: "b-1" },
    ])
    expect(result.sentTraceCount).toBe(2)
    expect(result.sentSpanCount).toBe(3)
  })

  it("allows traces to overlap when multiple trace runners are available", async () => {
    vi.useFakeTimers()
    const baseTime = new Date("2026-04-14T00:00:00.000Z")
    vi.setSystemTime(baseTime)

    const calls: Array<{ readonly atMs: number; readonly traceId: string; readonly label: string }> = []
    const traces = [
      createResolvedTrace({
        traceId: "trace-a",
        instanceIndex: 0,
        startDelayMs: 0,
        spans: [createSpan("a-1", 0, 100), createSpan("a-2", 150, 100)],
      }),
      createResolvedTrace({
        traceId: "trace-b",
        instanceIndex: 1,
        startDelayMs: 0,
        spans: [createSpan("b-1", 0, 50)],
      }),
    ] as const

    const dispatchPromise = dispatchResolvedTraces(traces, {
      ingestBaseUrl: "http://127.0.0.1:3002",
      parallelTraces: 2,
      runId: "dispatch-parallel",
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
      { atMs: 50, traceId: "trace-b", label: "b-1" },
      { atMs: 100, traceId: "trace-a", label: "a-1" },
      { atMs: 250, traceId: "trace-a", label: "a-2" },
    ])
    expect(result.sentTraceCount).toBe(2)
    expect(result.sentSpanCount).toBe(3)
  })

  it("enriches span tags and metadata using seed-style context only", async () => {
    vi.useFakeTimers()
    const baseTime = new Date("2026-04-14T00:00:00.000Z")
    vi.setSystemTime(baseTime)

    const capturedRequests: unknown[] = []
    const traces = [
      createResolvedTrace({
        traceId: "trace-seed-context",
        instanceIndex: 0,
        startDelayMs: 0,
        spans: [createSpan("seed-context", 0, 100)],
      }),
    ] as const

    const dispatchPromise = dispatchResolvedTraces(traces, {
      ingestBaseUrl: "http://127.0.0.1:3002",
      parallelTraces: 1,
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

  it("logs summary progress by default and span details only in verbose mode", async () => {
    vi.useFakeTimers()
    const baseTime = new Date("2026-04-14T00:00:00.000Z")
    vi.setSystemTime(baseTime)

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const traces = [
      createResolvedTrace({
        traceId: "trace-log-a",
        instanceIndex: 0,
        startDelayMs: 0,
        spans: [createSpan("a-1", 0, 100), createSpan("a-2", 150, 100)],
      }),
    ] as const

    const summaryDispatchPromise = dispatchResolvedTraces(traces, {
      ingestBaseUrl: "http://127.0.0.1:3002",
      parallelTraces: 1,
      runId: "dispatch-summary-logs",
      postTraceSpan: async () => {},
    })

    await vi.runAllTimersAsync()
    await summaryDispatchPromise

    const summaryMessages = logSpy.mock.calls.map(([message]) => String(message))
    expect(summaryMessages.some((message) => message.startsWith("[trace] completed"))).toBe(true)
    expect(summaryMessages.some((message) => message.startsWith("[progress]"))).toBe(true)
    expect(summaryMessages.some((message) => message.startsWith("[span]"))).toBe(false)

    logSpy.mockClear()

    const verboseDispatchPromise = dispatchResolvedTraces(traces, {
      ingestBaseUrl: "http://127.0.0.1:3002",
      parallelTraces: 1,
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

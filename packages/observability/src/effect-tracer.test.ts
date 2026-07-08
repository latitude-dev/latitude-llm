import type { TracerProvider } from "@opentelemetry/api"
import { context, SpanStatusCode, trace } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { Effect } from "effect"
import type { Exit } from "effect/Exit"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { withTracing } from "./effect-tracer.ts"

const clientError = {
  _tag: "BadRequestError",
  httpStatus: 400,
  httpMessage: "User-authored signals manage their own evaluation and cannot be monitored or realigned",
}

const serverError = {
  _tag: "RepositoryError",
  httpStatus: 500,
  httpMessage: "Internal server error",
}

describe("withTracing", () => {
  let originalProvider: TracerProvider | undefined
  let exporter: InMemorySpanExporter
  let provider: BasicTracerProvider
  let otelTracer: ReturnType<typeof trace.getTracer>

  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager())
    originalProvider = trace.getTracerProvider()

    exporter = new InMemorySpanExporter()
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    })
    trace.setGlobalTracerProvider(provider)
    otelTracer = trace.getTracer("observability-test")
  })

  afterEach(async () => {
    await provider.forceFlush()
    exporter.reset()
  })

  afterAll(() => {
    if (originalProvider) {
      trace.setGlobalTracerProvider(originalProvider)
    }
  })

  it("parents Effect spans to the active OTel span", async () => {
    let parentSpanId: string | undefined
    let parentTraceId: string | undefined

    otelTracer.startActiveSpan("worker.root", (span) => {
      const spanContext = span.spanContext()
      parentSpanId = spanContext.spanId
      parentTraceId = spanContext.traceId

      Effect.runSync(Effect.void.pipe(Effect.withSpan("effect.child"), withTracing))

      span.end()
    })

    await provider.forceFlush()

    const childSpan = exporter.getFinishedSpans().find((finished) => finished.name === "effect.child")

    expect(childSpan).toBeDefined()
    expect(childSpan?.spanContext().traceId).toBe(parentTraceId)
    expect(childSpan?.spanContext().spanId).not.toBe(parentSpanId)
  })

  it("does not mark the traced span as an error for expected 4xx HttpErrors", async () => {
    const effect = Effect.fail(clientError).pipe(Effect.withSpan("evaluations.monitorSignal"), withTracing)

    let exit: Exit<never, typeof clientError> | undefined
    otelTracer.startActiveSpan("request", (span) => {
      exit = Effect.runSyncExit(effect)
      span.end()
    })
    expect(exit?._tag).toBe("Failure")

    await provider.forceFlush()

    const tracedSpan = exporter.getFinishedSpans().find((finished) => finished.name === "evaluations.monitorSignal")
    expect(tracedSpan).toBeDefined()
    expect(tracedSpan?.status.code).not.toBe(SpanStatusCode.ERROR)
  })

  it("marks the traced span as an error for 5xx HttpErrors", async () => {
    const effect = Effect.fail(serverError).pipe(Effect.withSpan("evaluations.monitorSignal"), withTracing)

    let exit: Exit<never, typeof serverError> | undefined
    otelTracer.startActiveSpan("request", (span) => {
      exit = Effect.runSyncExit(effect)
      span.end()
    })
    expect(exit?._tag).toBe("Failure")

    await provider.forceFlush()

    const tracedSpan = exporter.getFinishedSpans().find((finished) => finished.name === "evaluations.monitorSignal")
    expect(tracedSpan).toBeDefined()
    expect(tracedSpan?.status.code).toBe(SpanStatusCode.ERROR)
  })
})

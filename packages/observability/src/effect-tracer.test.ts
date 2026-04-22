import type { TracerProvider } from "@opentelemetry/api"
import { context, trace } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { Effect } from "effect"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { withTracing } from "./effect-tracer.ts"

describe("withTracing", () => {
  let originalProvider: TracerProvider | undefined

  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager())
  })

  afterEach(async () => {
    if (originalProvider) {
      trace.setGlobalTracerProvider(originalProvider)
      originalProvider = undefined
    }
  })

  it("parents Effect spans to the active OTel span", async () => {
    originalProvider = trace.getTracerProvider()

    const exporter = new InMemorySpanExporter()
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    })

    trace.setGlobalTracerProvider(provider)

    const tracer = trace.getTracer("observability-test")
    let parentSpanId: string | undefined
    let parentTraceId: string | undefined

    tracer.startActiveSpan("worker.root", (span) => {
      const spanContext = span.spanContext()
      parentSpanId = spanContext.spanId
      parentTraceId = spanContext.traceId

      Effect.runSync(Effect.void.pipe(Effect.withSpan("effect.child"), withTracing))

      span.end()
    })

    await provider.forceFlush()

    const childSpan = exporter.getFinishedSpans().find((span) => span.name === "effect.child")

    expect(childSpan).toBeDefined()
    expect(childSpan?.spanContext().traceId).toBe(parentTraceId)
    expect(childSpan?.spanContext().spanId).not.toBe(parentSpanId)
  })
})

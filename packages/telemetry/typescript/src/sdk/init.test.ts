import { context, propagation, type Tracer, type TracerProvider, trace } from "@opentelemetry/api"
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node"
import { afterEach, describe, expect, it } from "vitest"
import { Latitude } from "./init.ts"

describe("Latitude", () => {
  afterEach(() => {
    trace.disable()
    context.disable()
    propagation.disable()
  })

  it("should throw if apiKey is missing", () => {
    expect(() => new Latitude({ apiKey: "", projectSlug: "test" })).toThrow("apiKey is required")
  })

  it("should throw if projectSlug is missing", () => {
    expect(() => new Latitude({ apiKey: "test", projectSlug: "" })).toThrow("projectSlug is required")
  })

  it("should return provider, flush, shutdown, and ready functions", async () => {
    const result = new Latitude({
      apiKey: "test-key",
      projectSlug: "test-project",
    })
    expect(result.provider).toBeDefined()
    expect(result.flush).toBeTypeOf("function")
    expect(result.shutdown).toBeTypeOf("function")
    await result.shutdown()
  })

  it("adds Latitude's processor to an existing global provider", async () => {
    const existingExporter = new InMemorySpanExporter()
    const latitudeExporter = new InMemorySpanExporter()
    const existingProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(existingExporter)],
    })
    trace.setGlobalTracerProvider(existingProvider)

    const result = new Latitude({
      apiKey: "test-key",
      projectSlug: "test-project",
      exporter: latitudeExporter,
      disableBatch: true,
    })

    expect(result.provider).toBe(existingProvider)

    const span = trace.getTracer("init-test").startSpan("llm-call")
    span.setAttribute("gen_ai.system", "openai")
    span.end()

    await result.flush()

    expect(existingExporter.getFinishedSpans()).toHaveLength(1)
    expect(latitudeExporter.getFinishedSpans()).toHaveLength(1)

    await result.shutdown()
  })

  it("uses an explicitly provided tracer provider", async () => {
    const spanProcessors: unknown[] = []
    const explicitProvider: TracerProvider & { addSpanProcessor: (processor: unknown) => void } = {
      getTracer: () => ({}) as Tracer,
      addSpanProcessor: (processor) => {
        spanProcessors.push(processor)
      },
    }

    const result = new Latitude({
      apiKey: "test-key",
      projectSlug: "test-project",
      tracerProvider: explicitProvider,
    })

    expect(result.provider).toBe(explicitProvider)
    expect(spanProcessors).toHaveLength(1)

    await result.shutdown()
  })

  it("supports Datadog-style private processor lists when addSpanProcessor is unavailable", async () => {
    const spanProcessors: unknown[] = []
    const datadogLikeProvider = {
      getTracer: () => ({}) as Tracer,
      _activeProcessor: {
        _processors: spanProcessors,
      },
    } satisfies TracerProvider & { _activeProcessor: { _processors: unknown[] } }

    const result = new Latitude({
      apiKey: "test-key",
      projectSlug: "test-project",
      tracerProvider: datadogLikeProvider,
    })

    expect(result.provider).toBe(datadogLikeProvider)
    expect(spanProcessors).toHaveLength(1)

    await result.shutdown()
  })
})

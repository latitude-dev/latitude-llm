import { context, propagation, type Tracer, type TracerProvider, trace } from "@opentelemetry/api"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node"
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions"
import { afterEach, describe, expect, it, vi } from "vitest"
import { initLatitude, Latitude } from "./init.ts"

describe("Latitude", () => {
  afterEach(() => {
    trace.disable()
    context.disable()
    propagation.disable()
  })

  it("should throw if apiKey is missing", () => {
    expect(() => new Latitude({ apiKey: "", projectSlug: "test" })).toThrow("apiKey is required")
  })

  it("accepts an empty or omitted projectSlug (per-capture scoping covers the rest)", () => {
    expect(() => new Latitude({ apiKey: "test", projectSlug: "" })).not.toThrow()
    expect(() => new Latitude({ apiKey: "test" })).not.toThrow()
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

  it("keeps initLatitude as a deprecated compatibility wrapper", async () => {
    const result = initLatitude({
      apiKey: "test-key",
      projectSlug: "test-project",
    })

    expect(result).toBeInstanceOf(Latitude)
    expect(result.provider).toBeDefined()
    expect(result.ready).toBeInstanceOf(Promise)
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

  it("supports OTel JS v2 NodeSDK-style providers via the MultiSpanProcessor list", async () => {
    const spanProcessors: unknown[] = []
    const nodeSdkLikeProvider = {
      getTracer: () => ({}) as Tracer,
      _activeSpanProcessor: {
        _spanProcessors: spanProcessors,
      },
    } satisfies TracerProvider & { _activeSpanProcessor: { _spanProcessors: unknown[] } }

    const result = new Latitude({
      apiKey: "test-key",
      projectSlug: "test-project",
      tracerProvider: nodeSdkLikeProvider,
    })

    expect(result.provider).toBe(nodeSdkLikeProvider)
    expect(spanProcessors).toHaveLength(1)

    await result.shutdown()
  })

  it("warns and falls back when the provider exposes no known attach hook", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const opaqueProvider = { getTracer: () => ({}) as Tracer } satisfies TracerProvider

    const result = new Latitude({
      apiKey: "test-key",
      projectSlug: "test-project",
      tracerProvider: opaqueProvider,
    })

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Could not attach LatitudeSpanProcessor"))
    // The fallback creates its own provider (not registered globally) so the caller can still
    // get Latitude spans through explicit instrumentation.
    expect(result.provider).not.toBe(opaqueProvider)
    expect(trace.getTracerProvider()).not.toBe(result.provider)

    warnSpy.mockRestore()
    await result.shutdown()
  })

  it("applies serviceName to exported spans as a resource attribute, not a span attribute", async () => {
    const latitudeExporter = new InMemorySpanExporter()

    const result = new Latitude({
      apiKey: "test-key",
      projectSlug: "test-project",
      serviceName: "custom-service",
      exporter: latitudeExporter,
      disableBatch: true,
    })

    const span = trace.getTracer("svc-name-test").startSpan("llm-call")
    span.setAttribute("gen_ai.system", "openai")
    span.end()

    await result.flush()

    const finished = latitudeExporter.getFinishedSpans()
    expect(finished).toHaveLength(1)
    // Resource carries the override (correct per OTel semantic conventions).
    expect(finished[0]?.resource.attributes[ATTR_SERVICE_NAME]).toBe("custom-service")
    // Span attributes do NOT carry service.name (which would be off-spec).
    expect(finished[0]?.attributes[ATTR_SERVICE_NAME]).toBeUndefined()

    await result.shutdown()
  })

  it("ignores serviceName when piggy-backing — host provider's resource is the source of truth", async () => {
    const hostExporter = new InMemorySpanExporter()
    const latitudeExporter = new InMemorySpanExporter()
    const existingProvider = new NodeTracerProvider({
      resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: "host-service" }),
      spanProcessors: [new SimpleSpanProcessor(hostExporter)],
    })
    trace.setGlobalTracerProvider(existingProvider)

    const result = new Latitude({
      apiKey: "test-key",
      projectSlug: "test-project",
      serviceName: "latitude-service", // explicitly passed — should be ignored when piggy-backing
      exporter: latitudeExporter,
      disableBatch: true,
    })

    const span = trace.getTracer("svc-name-piggy").startSpan("llm-call")
    span.setAttribute("gen_ai.system", "openai")
    span.end()

    await result.flush()

    // Both exporters see the host's service.name — Latitude defers to the host.
    expect(hostExporter.getFinishedSpans()[0]?.resource.attributes[ATTR_SERVICE_NAME]).toBe("host-service")
    expect(latitudeExporter.getFinishedSpans()[0]?.resource.attributes[ATTR_SERVICE_NAME]).toBe("host-service")

    await result.shutdown()
  })
})

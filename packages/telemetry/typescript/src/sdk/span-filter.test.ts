import { context, trace } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  type ReadableSpan,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { SCOPE_LATITUDE } from "../constants/scope.ts"
import {
  buildShouldExportSpan,
  ExportFilterSpanProcessor,
  isDefaultExportSpan,
  isGenAiOrLlmAttributeSpan,
  isLatitudeInstrumentationSpan,
} from "./span-filter.ts"

function mockSpan(overrides: { scopeName?: string; attributes?: Record<string, unknown> }): ReadableSpan {
  const { scopeName = "", attributes = {} } = overrides
  return {
    instrumentationScope: { name: scopeName },
    attributes,
  } as unknown as ReadableSpan
}

describe("isLatitudeInstrumentationSpan", () => {
  it("matches manual and nested latitude scopes", () => {
    expect(isLatitudeInstrumentationSpan(mockSpan({ scopeName: `${SCOPE_LATITUDE}.manual` }))).toBe(true)
    expect(isLatitudeInstrumentationSpan(mockSpan({ scopeName: SCOPE_LATITUDE }))).toBe(true)
    expect(isLatitudeInstrumentationSpan(mockSpan({ scopeName: "express" }))).toBe(false)
  })
})

describe("isGenAiOrLlmAttributeSpan", () => {
  it("matches gen_ai and llm attribute prefixes", () => {
    expect(isGenAiOrLlmAttributeSpan(mockSpan({ attributes: { "gen_ai.request.model": "gpt-4" } }))).toBe(true)
    expect(isGenAiOrLlmAttributeSpan(mockSpan({ attributes: { "llm.model_name": "x" } }))).toBe(true)
    expect(isGenAiOrLlmAttributeSpan(mockSpan({ attributes: { "openinference.span.kind": "CHAIN" } }))).toBe(true)
    expect(isGenAiOrLlmAttributeSpan(mockSpan({ attributes: { "eve.session.id": "sess-1" } }))).toBe(true)
    expect(isGenAiOrLlmAttributeSpan(mockSpan({ attributes: { "flue.run.id": "run-1" } }))).toBe(true)
    expect(isGenAiOrLlmAttributeSpan(mockSpan({ attributes: { "http.route": "/api" } }))).toBe(false)
  })
})

describe("Vercel AI SDK v7 spans", () => {
  // v7's `@ai-sdk/otel` `OpenTelemetry` integration emits GenAI SemConv spans on the
  // `gen_ai` tracer scope (operation names invoke_agent / chat / execute_tool).
  it("exports v7 GenAI spans (gen_ai.* attributes)", () => {
    for (const op of ["invoke_agent", "chat", "execute_tool", "embeddings", "rerank"]) {
      const span = mockSpan({ scopeName: "gen_ai", attributes: { "gen_ai.operation.name": op } })
      expect(isGenAiOrLlmAttributeSpan(span)).toBe(true)
      expect(isDefaultExportSpan(span)).toBe(true)
      expect(buildShouldExportSpan({})(span)).toBe(true)
    }
  })

  // v7's `LegacyOpenTelemetry` (and v6 built-in) emit `ai.*` spans on the `ai` scope.
  it("exports v7/v6 legacy spans (ai.* attributes)", () => {
    const span = mockSpan({ scopeName: "ai", attributes: { "ai.operationId": "ai.streamText.doStream" } })
    expect(isGenAiOrLlmAttributeSpan(span)).toBe(true)
    expect(buildShouldExportSpan({})(span)).toBe(true)
  })

  it("still drops non-LLM spans regardless of scope", () => {
    const span = mockSpan({ scopeName: "gen_ai", attributes: { "http.route": "/api" } })
    expect(buildShouldExportSpan({})(span)).toBe(false)
  })
})

describe("isDefaultExportSpan", () => {
  it("rejects generic HTTP instrumentation", () => {
    expect(
      isDefaultExportSpan(
        mockSpan({
          scopeName: "opentelemetry.instrumentation.requests",
          attributes: { "http.method": "GET" },
        }),
      ),
    ).toBe(false)
  })

  it("accepts known LLM OTel scopes", () => {
    expect(isDefaultExportSpan(mockSpan({ scopeName: "opentelemetry.instrumentation.openai" }))).toBe(true)
    expect(isDefaultExportSpan(mockSpan({ scopeName: "openinference.instrumentation.langchain" }))).toBe(true)
  })

  it("accepts traceloop substring scopes", () => {
    expect(isDefaultExportSpan(mockSpan({ scopeName: "traceloop.instrumentation.openai" }))).toBe(true)
  })

  it("accepts langsmith substring scopes", () => {
    expect(isDefaultExportSpan(mockSpan({ scopeName: "my.langsmith.tracer" }))).toBe(true)
  })

  it("accepts litellm substring scopes", () => {
    expect(isDefaultExportSpan(mockSpan({ scopeName: "litellm.proxy" }))).toBe(true)
  })
})

describe("buildShouldExportSpan", () => {
  it("exports everything when smart filter disabled", () => {
    const pred = buildShouldExportSpan({ disableSmartFilter: true })
    expect(pred(mockSpan({ scopeName: "opentelemetry.instrumentation.requests" }))).toBe(true)
  })

  it("respects blocked scopes", () => {
    const pred = buildShouldExportSpan({
      blockedInstrumentationScopes: ["opentelemetry.instrumentation.openai"],
    })
    expect(pred(mockSpan({ scopeName: "opentelemetry.instrumentation.openai" }))).toBe(false)
    expect(pred(mockSpan({ scopeName: "opentelemetry.instrumentation.anthropic" }))).toBe(true)
  })

  it("composes with shouldExportSpan", () => {
    const pred = buildShouldExportSpan({
      shouldExportSpan: (s) => s.instrumentationScope?.name === "my.custom.scope",
    })
    expect(pred(mockSpan({ scopeName: "my.custom.scope" }))).toBe(true)
    expect(pred(mockSpan({ scopeName: "express" }))).toBe(false)
  })
})

describe("ExportFilterSpanProcessor parent-chain promotion", () => {
  const exporter = new InMemorySpanExporter()
  let provider: NodeTracerProvider
  let previousProvider: ReturnType<typeof trace.getTracerProvider>

  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager())
    previousProvider = trace.getTracerProvider()
    provider = new NodeTracerProvider({
      spanProcessors: [new ExportFilterSpanProcessor(buildShouldExportSpan({}), new SimpleSpanProcessor(exporter))],
    })
    trace.setGlobalTracerProvider(provider)
  })

  beforeEach(() => {
    exporter.reset()
  })

  afterAll(async () => {
    trace.setGlobalTracerProvider(previousProvider)
    await provider.shutdown()
  })

  it("exports an unstamped parent when a kept child ends first", async () => {
    const net = trace.getTracer("opentelemetry.instrumentation.net")
    const parent = net.startSpan("tcp.connect.parent")
    const child = net.startSpan(
      "tcp.connect",
      { attributes: { "latitude.tags": '["flagger"]' } },
      trace.setSpan(context.active(), parent),
    )
    child.end()
    parent.end()
    await provider.forceFlush()

    const names = exporter
      .getFinishedSpans()
      .map((s) => s.name)
      .sort()
    expect(names).toEqual(["tcp.connect", "tcp.connect.parent"])
    const exportedChild = exporter.getFinishedSpans().find((s) => s.name === "tcp.connect")
    const exportedParent = exporter.getFinishedSpans().find((s) => s.name === "tcp.connect.parent")
    expect(exportedChild?.parentSpanContext?.spanId).toBe(exportedParent?.spanContext().spanId)
  })

  it("flushes an already-dropped parent when a later child is kept", async () => {
    const net = trace.getTracer("opentelemetry.instrumentation.net")
    const parent = net.startSpan("http.request")
    const childCtx = trace.setSpan(context.active(), parent)
    // End parent before the kept child — unusual but possible with async instrumentation.
    parent.end()

    const child = net.startSpan("tcp.connect", { attributes: { "latitude.capture.name": "flagger.draft" } }, childCtx)
    child.end()
    await provider.forceFlush()

    const names = exporter
      .getFinishedSpans()
      .map((s) => s.name)
      .sort()
    expect(names).toEqual(["http.request", "tcp.connect"])
  })

  it("still drops spans with no kept descendant", async () => {
    const net = trace.getTracer("opentelemetry.instrumentation.net")
    const parent = net.startSpan("dns.lookup")
    const child = net.startSpan("tcp.connect", undefined, trace.setSpan(context.active(), parent))
    child.end()
    parent.end()
    await provider.forceFlush()

    expect(exporter.getFinishedSpans()).toHaveLength(0)
  })

  it("promotes a multi-level ancestor chain", async () => {
    const net = trace.getTracer("opentelemetry.instrumentation.net")
    const root = net.startSpan("http.request")
    const mid = net.startSpan("tls.connect", undefined, trace.setSpan(context.active(), root))
    const leaf = net.startSpan(
      "tcp.connect",
      { attributes: { "gen_ai.request.model": "gpt-4" } },
      trace.setSpan(context.active(), mid),
    )
    leaf.end()
    mid.end()
    root.end()
    await provider.forceFlush()

    const names = exporter
      .getFinishedSpans()
      .map((s) => s.name)
      .sort()
    expect(names).toEqual(["http.request", "tcp.connect", "tls.connect"])
  })

  it("still promotes ancestors after the dropped-span buffer fills", async () => {
    const net = trace.getTracer("opentelemetry.instrumentation.net")
    const parent = net.startSpan("http.request")
    parent.end()

    for (let i = 0; i < 2048; i++) {
      net.startSpan(`noise-${i}`).end()
    }

    const child = net.startSpan(
      "tcp.connect",
      { attributes: { "gen_ai.request.model": "gpt-4" } },
      trace.setSpan(context.active(), parent),
    )
    child.end()
    await provider.forceFlush()

    const names = exporter
      .getFinishedSpans()
      .map((s) => s.name)
      .sort()
    expect(names).toEqual(["http.request", "tcp.connect"])
  })
})

describe("ExportFilterSpanProcessor blocked scopes", () => {
  it("does not export a blocked ancestor even when a kept child promotes the chain", async () => {
    const exporter = new InMemorySpanExporter()
    const provider = new NodeTracerProvider({
      spanProcessors: [
        new ExportFilterSpanProcessor(
          buildShouldExportSpan({
            blockedInstrumentationScopes: ["opentelemetry.instrumentation.net"],
          }),
          new SimpleSpanProcessor(exporter),
          { blockedInstrumentationScopes: ["opentelemetry.instrumentation.net"] },
        ),
      ],
    })

    const http = provider.getTracer("opentelemetry.instrumentation.http")
    const net = provider.getTracer("opentelemetry.instrumentation.net")
    const parent = http.startSpan("http.request")
    const blocked = net.startSpan("tcp.connect", undefined, trace.setSpan(context.active(), parent))
    const leaf = http.startSpan(
      "genai.child",
      { attributes: { "gen_ai.request.model": "gpt-4" } },
      trace.setSpan(context.active(), blocked),
    )
    leaf.end()
    blocked.end()
    parent.end()
    await provider.forceFlush()

    const names = exporter
      .getFinishedSpans()
      .map((s) => s.name)
      .sort()
    expect(names).toEqual(["genai.child", "http.request"])
    await provider.shutdown()
  })
})

import { type Attributes, context, trace } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  type ReadableSpan,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { ATTRIBUTES, COST_SOURCE_USER } from "../constants/index.ts"
import { capture } from "./context.ts"
import type { ModelPricing } from "./cost.ts"
import { LatitudeSpanProcessor } from "./processor.ts"
import {
  DEFAULT_REDACT_PATTERNS,
  REDACTION_EXEMPT_ATTRIBUTES,
  RedactSpanProcessor,
  type RedactSpanProcessorOptions,
} from "./redact.ts"
import { RedactThenExportSpanProcessor } from "./span-filter.ts"

const MASK = "******"
const PRICING: Record<string, ModelPricing> = { "openai/gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 } }
const LLM_ATTRS: Attributes = {
  "gen_ai.operation.name": "chat",
  "gen_ai.system": "openai",
  "gen_ai.request.model": "gpt-4o",
  "gen_ai.usage.input_tokens": 1000,
  "gen_ai.usage.output_tokens": 500,
}
const SDK_COST_KEYS = new Set<string>([
  ATTRIBUTES.costInput,
  ATTRIBUTES.costOutput,
  ATTRIBUTES.costTotal,
  ATTRIBUTES.costSource,
])

type HarnessOptions = {
  redact?: RedactSpanProcessorOptions
  disableRedact?: boolean
  pricing?: Record<string, ModelPricing>
}

function harness(options: HarnessOptions = {}) {
  const exporter = new InMemorySpanExporter()
  const otherExporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider({
    spanProcessors: [
      new LatitudeSpanProcessor("fake-api-key", "test-project", { disableBatch: true, exporter, ...options }),
      // An unrelated processor on the same provider: Latitude's redaction is export-only.
      new SimpleSpanProcessor(otherExporter),
    ],
  })
  trace.setGlobalTracerProvider(provider)
  const tracer = provider.getTracer("test.llm")

  const llmCall = (
    attributes: Attributes = {},
    extra: { event?: Attributes; link?: Attributes; name?: string } = {},
  ): void => {
    const links = extra.link
      ? [{ context: { traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: 1 }, attributes: extra.link }]
      : []
    const span = tracer.startSpan(extra.name ?? "openai.chat", { attributes: { ...LLM_ATTRS, ...attributes }, links })
    if (extra.event) span.addEvent("details", extra.event)
    span.end()
  }

  const find = (spans: ReadableSpan[], name: string): ReadableSpan => {
    const span = spans.find((s) => s.name === name)
    if (!span) throw new Error(`span ${name} not exported`)
    return span
  }
  const span = (name = "openai.chat") => find(exporter.getFinishedSpans(), name)
  const otherSpan = (name = "openai.chat") => find(otherExporter.getFinishedSpans(), name)

  return { tracer, llmCall, span, otherSpan }
}

function expectOnlyAttributionSurvives(attrs: Attributes, expected: Attributes) {
  for (const [key, value] of Object.entries(attrs)) {
    if (REDACTION_EXEMPT_ATTRIBUTES.has(key)) expect(value, key).toBe(expected[key])
    else if (!SDK_COST_KEYS.has(key)) expect(value, key).toBe(MASK)
  }
  for (const key of Object.keys(expected)) expect(attrs).toHaveProperty([key])
}

describe("redaction", () => {
  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  })

  afterEach(() => {
    trace.disable()
    vi.restoreAllMocks()
  })

  describe("LatitudeSpanProcessor", () => {
    it("redacts db.statement with the default patterns", () => {
      const h = harness()
      h.llmCall({ "db.statement": "SELECT * FROM users", "http.request.header.authorization": "Bearer x" })
      const attrs = h.span().attributes
      expect(attrs["db.statement"]).toBe(MASK)
      expect(attrs["http.request.header.authorization"]).toBe(MASK)
      expect(attrs["gen_ai.usage.input_tokens"]).toBe(1000)
    })

    it("redacts custom patterns, which replace the defaults", () => {
      const h = harness({ redact: { attributes: [/^secret\./, "api.token"] } })
      h.llmCall({ "secret.password": "hunter2", "api.token": "tok", "db.statement": "SELECT 1" })
      const attrs = h.span().attributes
      expect(attrs["secret.password"]).toBe(MASK)
      expect(attrs["api.token"]).toBe(MASK)
      expect(attrs["db.statement"]).toBe("SELECT 1")
    })

    it("keeps the defaults when they are spread into a custom redact", () => {
      const h = harness({ redact: { attributes: [...DEFAULT_REDACT_PATTERNS, "api.token"] } })
      h.llmCall({ "api.token": "tok", "db.statement": "SELECT 1" })
      expect(h.span().attributes["db.statement"]).toBe(MASK)
      expect(h.span().attributes["api.token"]).toBe(MASK)
    })

    it("uses a custom mask", () => {
      const h = harness({ redact: { attributes: ["secret"], mask: (key) => `<${key}>` } })
      h.llmCall({ secret: "s3cr3t" })
      expect(h.span().attributes.secret).toBe("<secret>")
    })

    it("redacts event and link attributes", () => {
      const h = harness({ redact: { attributes: [/^secret\./] } })
      h.llmCall({}, { event: { "secret.value": "hunter2", public: "ok" }, link: { "secret.link": "l", keep: "k" } })
      const span = h.span()
      expect(span.events[0]?.name).toBe("details")
      expect(span.events[0]?.attributes).toEqual({ "secret.value": MASK, public: "ok" })
      expect(span.links[0]?.attributes).toEqual({ "secret.link": MASK, keep: "k" })
    })

    it("exports raw values when redaction is disabled", () => {
      const h = harness({ disableRedact: true })
      h.llmCall({ "db.statement": "SELECT 1" })
      expect(h.span().attributes["db.statement"]).toBe("SELECT 1")
    })

    it("leaves the span other processors see untouched", () => {
      const h = harness({ redact: { attributes: [/^secret\./] } })
      h.llmCall(
        { "secret.password": "hunter2" },
        { event: { "secret.value": "hunter2" }, link: { "secret.link": "l" } },
      )
      expect(h.span().attributes["secret.password"]).toBe(MASK)
      const other = h.otherSpan()
      expect(other.attributes["secret.password"]).toBe("hunter2")
      expect(other.events[0]?.attributes).toEqual({ "secret.value": "hunter2" })
      expect(other.links[0]?.attributes).toEqual({ "secret.link": "l" })
    })

    it("fails closed and still exports when the mask throws", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      const h = harness({
        redact: {
          attributes: ["secret"],
          mask: () => {
            throw new Error("boom")
          },
        },
      })
      expect(() => h.llmCall({ secret: "s3cr3t" }, { event: { secret: "e" } })).not.toThrow()
      const span = h.span()
      expect(span.attributes.secret).toBe(MASK)
      expect(span.events[0]?.attributes?.secret).toBe(MASK)
    })

    it("falls back when the mask returns a non-attribute value", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      const mask = (() => ({ x: 1 })) as unknown as (attribute: string, value: unknown) => string
      const h = harness({ redact: { attributes: ["secret"], mask } })
      h.llmCall({ secret: "s3cr3t" })
      expect(h.span().attributes.secret).toBe(MASK)
    })

    it("masks every attribute and still exports when redaction itself crashes", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.spyOn(
        RedactSpanProcessor.prototype as unknown as { redactList: () => never },
        "redactList",
      ).mockImplementation(() => {
        throw new Error("boom")
      })
      const h = harness({ redact: { attributes: ["secret"] } })
      expect(() => h.llmCall({ secret: "s3cr3t" }, { event: { secret: "e" } })).not.toThrow()
      const span = h.span()
      expect(new Set(Object.values(span.attributes))).toEqual(new Set([MASK]))
      expect(span.events).toEqual([])
    })

    it("treats a /g pattern consistently across attributes", () => {
      const h = harness({ redact: { attributes: [/^secret/g] } })
      h.llmCall({ secret1: "a", secret2: "b", secret3: "c" })
      const attrs = h.span().attributes
      expect([attrs.secret1, attrs.secret2, attrs.secret3]).toEqual([MASK, MASK, MASK])
    })
  })

  describe("cost and redaction", () => {
    it("resolves cost from unredacted tokens and never masks the SDK's cost", () => {
      const h = harness({ pricing: PRICING, redact: { attributes: [/^gen_ai\./] } })
      h.llmCall({ "gen_ai.usage.input_cost": 99 })
      const attrs = h.span().attributes
      expect(attrs["gen_ai.usage.input_tokens"]).toBe(MASK)
      expect(attrs[ATTRIBUTES.costInput]).toBeCloseTo(0.0025)
      expect(attrs[ATTRIBUTES.costTotal]).toBeCloseTo(0.0075)
      expect(attrs[ATTRIBUTES.costSource]).toBe(COST_SOURCE_USER)
    })

    it("keeps capture cost under a broad pattern", () => {
      const h = harness({ redact: { attributes: [/^gen_ai\./] } })
      capture("agent", () => h.llmCall(), { cost: { total: 0.5 } })
      const attrs = h.span().attributes
      expect(attrs["gen_ai.usage.input_tokens"]).toBe(MASK)
      expect(attrs[ATTRIBUTES.costTotal]).toBe(0.5)
    })

    it("redacts instrumentor cost when the SDK sets none", () => {
      const h = harness({ redact: { attributes: [/_cost$/] } })
      h.llmCall({ "gen_ai.usage.total_cost": 1 })
      const attrs = h.span().attributes
      expect(attrs["gen_ai.usage.total_cost"]).toBe(MASK)
      expect(attrs).not.toHaveProperty([ATTRIBUTES.costSource])
    })
  })

  describe("attribution attributes", () => {
    it("exempts exactly the ingest attribution keys", () => {
      // Mirrors packages/domain/spans/src/otlp/resolvers/{operation,identity}.ts; keep in sync.
      expect([...REDACTION_EXEMPT_ATTRIBUTES].sort()).toEqual(
        [
          "gen_ai.operation.name",
          "openinference.span.kind",
          "llm.request.type",
          "ai.operationId",
          "latitude.span.kind",
          "span.type",
          "gen_ai.provider.name",
          "gen_ai.system",
          "gen_ai.model.provider",
          "llm.system",
          "llm.provider",
          "ai.model.provider",
          "gen_ai.request.model",
          "gen_ai.response.model",
          "llm.model_name",
          "embedding.model_name",
          "reranker.model_name",
          "ai.model.id",
          "ai.response.model",
        ].sort(),
      )
    })

    const genAi: Attributes = {
      [ATTRIBUTES.operationName]: "chat",
      [ATTRIBUTES.providerName]: "openai",
      [ATTRIBUTES.system]: "openai",
      [ATTRIBUTES.requestModel]: "gpt-4o",
      [ATTRIBUTES.responseModel]: "gpt-4o-2024-08-06",
    }

    it("keeps them under a broad pattern when the SDK set a cost", () => {
      const h = harness({ pricing: PRICING, redact: { attributes: [/.*/] } })
      h.llmCall({ ...genAi, "gen_ai.prompt.0.content": "secret prompt" })
      const attrs = h.span().attributes
      expectOnlyAttributionSurvives(attrs, genAi)
      expect(attrs["gen_ai.prompt.0.content"]).toBe(MASK)
      expect(attrs[ATTRIBUTES.costTotal]).toBeCloseTo(0.0075)
    })

    it("keeps them under a broad pattern when the SDK set no cost, including in events", () => {
      const h = harness({ redact: { attributes: [/^gen_ai\./, /.*/] } })
      h.llmCall(genAi, { event: { [ATTRIBUTES.requestModel]: "gpt-4o", detail: "x" } })
      const span = h.span()
      expectOnlyAttributionSurvives(span.attributes, genAi)
      expect(span.attributes).not.toHaveProperty([ATTRIBUTES.costSource])
      expect(span.events[0]?.attributes).toEqual({ [ATTRIBUTES.requestModel]: "gpt-4o", detail: MASK })
    })

    it.each([
      [
        "openinference",
        {
          [ATTRIBUTES.openinferenceSpanKind]: "LLM",
          [ATTRIBUTES.llmSystem]: "openai",
          [ATTRIBUTES.llmProvider]: "openai",
          [ATTRIBUTES.llmModelName]: "gpt-4o",
        },
      ],
      [
        "vercel",
        {
          [ATTRIBUTES.aiOperationId]: "ai.generateText.doGenerate",
          [ATTRIBUTES.aiModelProvider]: "openai.chat",
          [ATTRIBUTES.aiModelId]: "gpt-4o",
          [ATTRIBUTES.aiResponseModel]: "gpt-4o-2024-08-06",
        },
      ],
      [
        "other conventions",
        {
          [ATTRIBUTES.llmRequestType]: "embedding",
          [ATTRIBUTES.modelProvider]: "openai",
          [ATTRIBUTES.embeddingModelName]: "text-embedding-3-small",
          [ATTRIBUTES.rerankerModelName]: "rerank-v3",
          [ATTRIBUTES.latitudeSpanKind]: "generation",
          [ATTRIBUTES.spanType]: "llm_request",
        },
      ],
    ] as const)("keeps %s attribution under a broad pattern", (_name, attribution: Attributes) => {
      const h = harness({ redact: { attributes: [/.*/] } })
      h.tracer.startSpan("llm", { attributes: { ...attribution, "llm.input_messages": "secret" } }).end()
      const attrs = h.span("llm").attributes
      expectOnlyAttributionSurvives(attrs, attribution)
      expect(attrs["llm.input_messages"]).toBe(MASK)
    })

    it("still redacts an exempt key listed as an exact string", () => {
      const h = harness({ redact: { attributes: [ATTRIBUTES.requestModel, /.*/] } })
      h.llmCall(genAi)
      const attrs = h.span().attributes
      expect(attrs[ATTRIBUTES.requestModel]).toBe(MASK)
      expect(attrs[ATTRIBUTES.responseModel]).toBe("gpt-4o-2024-08-06")
      expect(attrs[ATTRIBUTES.operationName]).toBe("chat")
    })
  })

  describe("standalone", () => {
    it("RedactThenExportSpanProcessor exports a redacted view and leaves the span raw", () => {
      const exporter = new InMemorySpanExporter()
      const otherExporter = new InMemorySpanExporter()
      const redact = new RedactSpanProcessor({ attributes: [/^secret\./] })
      const provider = new NodeTracerProvider({
        spanProcessors: [
          new RedactThenExportSpanProcessor(redact, new SimpleSpanProcessor(exporter)),
          new SimpleSpanProcessor(otherExporter),
        ],
      })
      const span = provider.getTracer("test").startSpan("op", { attributes: { "secret.key": "k", keep: "v" } })
      span.addEvent("evt", { "secret.e": "x" })
      span.end()
      const [exported] = exporter.getFinishedSpans()
      expect(exported?.attributes).toEqual({ "secret.key": MASK, keep: "v" })
      expect(exported?.events[0]?.attributes).toEqual({ "secret.e": MASK })
      expect(otherExporter.getFinishedSpans()[0]?.attributes).toEqual({ "secret.key": "k", keep: "v" })
    })

    it("RedactSpanProcessor registered directly masks in place and never throws", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      const exporter = new InMemorySpanExporter()
      const provider = new NodeTracerProvider({
        spanProcessors: [
          new RedactSpanProcessor({
            attributes: ["secret", "boom"],
            mask: (key) => {
              if (key === "boom") throw new Error("boom")
              return "[x]"
            },
          }),
          new SimpleSpanProcessor(exporter),
        ],
      })
      expect(() =>
        provider
          .getTracer("test")
          .startSpan("op", { attributes: { secret: "s", boom: "b", keep: "v" } })
          .end(),
      ).not.toThrow()
      expect(exporter.getFinishedSpans()[0]?.attributes).toEqual({ secret: "[x]", boom: MASK, keep: "v" })
    })

    it("RedactSpanProcessor registered directly fails closed in place, including events and links", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.spyOn(
        RedactSpanProcessor.prototype as unknown as { redactList: () => never },
        "redactList",
      ).mockImplementation(() => {
        throw new Error("boom")
      })
      const exporter = new InMemorySpanExporter()
      const provider = new NodeTracerProvider({
        spanProcessors: [new RedactSpanProcessor({ attributes: ["secret"] }), new SimpleSpanProcessor(exporter)],
      })
      const span = provider.getTracer("test").startSpan("op", {
        attributes: { secret: "s", keep: "v" },
        links: [
          {
            context: { traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: 1 },
            attributes: { "link.secret": "l" },
          },
        ],
      })
      span.addEvent("evt", { "event.secret": "e" })
      expect(() => span.end()).not.toThrow()
      const [exported] = exporter.getFinishedSpans()
      expect(exported?.attributes).toEqual({ secret: MASK, keep: MASK })
      expect(exported?.events[0]?.attributes).toEqual({ "event.secret": MASK })
      expect(exported?.links[0]?.attributes).toEqual({ "link.secret": MASK })
    })
  })
})

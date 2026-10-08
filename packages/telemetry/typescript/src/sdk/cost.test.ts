import { type Attributes, context, trace } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { ATTRIBUTES, COST_SOURCE_USER } from "../constants/index.ts"
import { capture } from "./context.ts"
import { type CostResolver, type LlmUsage, type ModelPricing, setLlmCost } from "./cost.ts"
import { Latitude } from "./init.ts"
import { LatitudeSpanProcessor } from "./processor.ts"

const COST_KEYS = [ATTRIBUTES.costInput, ATTRIBUTES.costOutput, ATTRIBUTES.costTotal, ATTRIBUTES.costSource]
const PRICING: Record<string, ModelPricing> = { "openai/gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 } }

function costOf(attrs: Attributes): Attributes {
  return Object.fromEntries(COST_KEYS.filter((k) => k in attrs).map((k) => [k, attrs[k]]))
}

type HarnessOptions = { pricing?: Record<string, ModelPricing>; costResolver?: CostResolver }

function harness(options: HarnessOptions = {}) {
  const exporter = new InMemorySpanExporter()
  const otherExporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider({
    spanProcessors: [
      new LatitudeSpanProcessor("fake-api-key", "test-project", { disableBatch: true, exporter, ...options }),
      // A second, unrelated processor on the same provider must never see Latitude's cost.
      new SimpleSpanProcessor(otherExporter),
    ],
  })
  trace.setGlobalTracerProvider(provider)
  const tracer = provider.getTracer("test.llm")

  const llmCall = (name = "openai.chat", attributes: Attributes = {}) => {
    const base: Attributes = {
      "gen_ai.operation.name": "chat",
      "gen_ai.system": "openai",
      "gen_ai.request.model": "gpt-4o",
      "gen_ai.usage.input_tokens": 1000,
      "gen_ai.usage.output_tokens": 500,
    }
    const merged = Object.fromEntries(Object.entries({ ...base, ...attributes }).filter(([, v]) => v !== undefined))
    tracer.startSpan(name, { attributes: merged }).end()
  }

  const attrs = (name: string): Attributes => {
    const span = exporter.getFinishedSpans().find((s) => s.name === name)
    if (!span) throw new Error(`span ${name} not exported`)
    return { ...span.attributes }
  }
  const otherAttrs = (name: string): Attributes => {
    const span = otherExporter.getFinishedSpans().find((s) => s.name === name)
    if (!span) throw new Error(`span ${name} not seen by other processor`)
    return { ...span.attributes }
  }

  return { provider, tracer, llmCall, attrs, otherAttrs }
}

describe("customer-supplied LLM cost", () => {
  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  })

  afterEach(() => {
    trace.disable()
    vi.restoreAllMocks()
  })

  describe("capture cost", () => {
    it("stamps LLM-call child spans, not the capture wrapper span", () => {
      const h = harness()
      capture("agent-run", () => h.llmCall(), { cost: { input: 0.002, output: 0.004 } })

      expect(costOf(h.attrs("openai.chat"))).toEqual({
        [ATTRIBUTES.costInput]: 0.002,
        [ATTRIBUTES.costOutput]: 0.004,
        [ATTRIBUTES.costTotal]: 0.006,
        [ATTRIBUTES.costSource]: COST_SOURCE_USER,
      })
      expect(costOf(h.attrs("agent-run"))).toEqual({})
    })

    it("works with async captures and capture.start()", async () => {
      const h = harness()
      await capture(
        "async-run",
        async () => {
          await Promise.resolve()
          h.llmCall("async-call")
        },
        { cost: { total: 0.1 } },
      )
      const scope = capture.start("manual-scope", { cost: { total: 0.2 } })
      h.llmCall("scoped-call")
      scope.end()
      expect(h.attrs("async-call")[ATTRIBUTES.costTotal]).toBe(0.1)
      expect(h.attrs("scoped-call")[ATTRIBUTES.costTotal]).toBe(0.2)
    })

    it("does not stamp non-LLM spans inside the capture", () => {
      const h = harness()
      capture(
        "agent-run",
        () => {
          h.tracer.startSpan("db.query", { attributes: { "latitude.metadata": "{}" } }).end()
          h.tracer.startSpan("tool", { attributes: { "gen_ai.operation.name": "execute_tool" } }).end()
        },
        { cost: { total: 1 } },
      )
      expect(costOf(h.attrs("db.query"))).toEqual({})
      expect(costOf(h.attrs("tool"))).toEqual({})
    })

    it("total-only drops the instrumentor's input/output costs", () => {
      const h = harness()
      capture(
        "agent-run",
        () =>
          h.llmCall("openai.chat", {
            "gen_ai.usage.input_cost": 9,
            "gen_ai.usage.output_cost": 9,
            "gen_ai.usage.total_cost": 18,
            "llm.cost.prompt": 9,
          }),
        { cost: { total: 0.5 } },
      )
      const attrs = h.attrs("openai.chat")
      expect(costOf(attrs)).toEqual({ [ATTRIBUTES.costTotal]: 0.5, [ATTRIBUTES.costSource]: COST_SOURCE_USER })
      expect(attrs["llm.cost.prompt"]).toBeUndefined()
    })

    it("input/output replaces a stale instrumentor total", () => {
      const h = harness()
      capture("agent-run", () => h.llmCall("openai.chat", { "gen_ai.usage.total_cost": 18 }), {
        cost: { input: 1, output: 2 },
      })
      expect(h.attrs("openai.chat")[ATTRIBUTES.costTotal]).toBe(3)
    })

    it("honours an explicit zero", () => {
      const h = harness({ pricing: PRICING })
      capture("agent-run", () => h.llmCall(), { cost: { input: 0, output: 0 } })
      expect(costOf(h.attrs("openai.chat"))).toEqual({
        [ATTRIBUTES.costInput]: 0,
        [ATTRIBUTES.costOutput]: 0,
        [ATTRIBUTES.costTotal]: 0,
        [ATTRIBUTES.costSource]: COST_SOURCE_USER,
      })
    })

    it("ignores invalid amounts", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      const h = harness()
      capture("agent-run", () => h.llmCall(), { cost: { input: -1, output: Number.NaN } })
      expect(costOf(h.attrs("openai.chat"))).toEqual({})
    })

    it("nested captures inherit the cost unless they set their own", () => {
      const h = harness()
      capture(
        "outer",
        () => {
          capture("inherit", () => h.llmCall("inherited"))
          capture("override", () => h.llmCall("overridden"), { cost: { total: 2 } })
        },
        { cost: { total: 1 } },
      )
      expect(h.attrs("inherited")[ATTRIBUTES.costTotal]).toBe(1)
      expect(h.attrs("overridden")[ATTRIBUTES.costTotal]).toBe(2)
    })

    it("does not mutate the span other processors see", () => {
      const h = harness()
      capture("agent-run", () => h.llmCall("openai.chat", { "gen_ai.usage.total_cost": 18 }), {
        cost: { total: 0.5 },
      })
      expect(h.attrs("openai.chat")[ATTRIBUTES.costTotal]).toBe(0.5)
      const other = h.otherAttrs("openai.chat")
      expect(other["gen_ai.usage.total_cost"]).toBe(18)
      expect(other[ATTRIBUTES.costSource]).toBeUndefined()
    })
  })

  describe("pricing", () => {
    it("computes cost from token counts (provider match is case-insensitive)", () => {
      const h = harness({ pricing: PRICING })
      h.llmCall("openai.chat", { "gen_ai.system": "OpenAI" })
      const attrs = h.attrs("openai.chat")
      expect(attrs[ATTRIBUTES.costInput]).toBeCloseTo(0.0025)
      expect(attrs[ATTRIBUTES.costOutput]).toBeCloseTo(0.005)
      expect(attrs[ATTRIBUTES.costTotal]).toBeCloseTo(0.0075)
      expect(attrs[ATTRIBUTES.costSource]).toBe(COST_SOURCE_USER)
    })

    it("prefers the response model, then the request model", () => {
      const h = harness({
        pricing: { ...PRICING, "openai/gpt-4o-2024-08-06": { inputPer1M: 1, outputPer1M: 1 } },
      })
      h.llmCall("dated", { "gen_ai.response.model": "gpt-4o-2024-08-06" })
      h.llmCall("unknown-response", { "gen_ai.response.model": "gpt-4o-unknown" })
      expect(h.attrs("dated")[ATTRIBUTES.costTotal]).toBeCloseTo(0.0015)
      expect(h.attrs("unknown-response")[ATTRIBUTES.costTotal]).toBeCloseTo(0.0075)
    })

    it("leaves the span untouched when the model is not priced", () => {
      const h = harness({ pricing: PRICING })
      h.llmCall("openai.chat", { "gen_ai.request.model": "claude-x", "gen_ai.usage.total_cost": 0.42 })
      const attrs = h.attrs("openai.chat")
      expect(attrs["gen_ai.usage.total_cost"]).toBe(0.42)
      expect(attrs[ATTRIBUTES.costSource]).toBeUndefined()
    })

    it("reads OpenInference attributes and treats a missing rate as 0", () => {
      const h = harness({ pricing: { "openai/text-embedding-3-small": { inputPer1M: 0.02 } } })
      h.tracer
        .startSpan("embed", {
          attributes: {
            "openinference.span.kind": "EMBEDDING",
            "llm.provider": "openai",
            "llm.model_name": "text-embedding-3-small",
            "llm.token_count.prompt": 1_000_000,
          },
        })
        .end()
      const attrs = h.attrs("embed")
      expect(attrs[ATTRIBUTES.costInput]).toBeCloseTo(0.02)
      expect(attrs[ATTRIBUTES.costOutput]).toBe(0)
      expect(attrs[ATTRIBUTES.costTotal]).toBeCloseTo(0.02)
    })

    it("does not price spans without token counts", () => {
      const h = harness({ pricing: PRICING })
      h.llmCall("openai.chat", { "gen_ai.usage.input_tokens": undefined, "gen_ai.usage.output_tokens": undefined })
      expect(costOf(h.attrs("openai.chat"))).toEqual({})
    })

    it("does not price the capture wrapper span", () => {
      const h = harness({ pricing: PRICING })
      capture("agent-run", () => h.llmCall())
      expect(costOf(h.attrs("agent-run"))).toEqual({})
      expect(h.attrs("openai.chat")[ATTRIBUTES.costSource]).toBe(COST_SOURCE_USER)
    })
  })

  describe("costResolver", () => {
    it("receives the usage and sets the cost", () => {
      const seen: LlmUsage[] = []
      const h = harness({
        pricing: PRICING,
        costResolver: (usage) => {
          seen.push(usage)
          return { total: 0.25 }
        },
      })
      h.llmCall("openai.chat", { "gen_ai.response.model": "gpt-4o-2024-08-06" })
      const attrs = h.attrs("openai.chat")
      expect(attrs[ATTRIBUTES.costTotal]).toBe(0.25)
      expect(attrs[ATTRIBUTES.costInput]).toBeUndefined()
      expect(seen[0]).toMatchObject({
        provider: "openai",
        model: "gpt-4o-2024-08-06",
        inputTokens: 1000,
        outputTokens: 500,
        operation: "chat",
      })
      expect(seen[0]?.attributes["gen_ai.request.model"]).toBe("gpt-4o")
    })

    it("falls back to pricing when it returns undefined or null", () => {
      const h = harness({ pricing: PRICING, costResolver: (usage) => (usage.model === "x" ? null : undefined) })
      h.llmCall()
      expect(h.attrs("openai.chat")[ATTRIBUTES.costTotal]).toBeCloseTo(0.0075)
    })

    it("falls back without breaking export when it throws", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      const h = harness({
        pricing: PRICING,
        costResolver: () => {
          throw new Error("boom")
        },
      })
      h.llmCall()
      h.llmCall("unpriced", { "gen_ai.request.model": "other" })
      expect(h.attrs("openai.chat")[ATTRIBUTES.costTotal]).toBeCloseTo(0.0075)
      expect(costOf(h.attrs("unpriced"))).toEqual({})
    })

    it("honours an explicit zero", () => {
      const h = harness({ pricing: PRICING, costResolver: () => ({ input: 0, output: 0 }) })
      h.llmCall()
      expect(h.attrs("openai.chat")[ATTRIBUTES.costTotal]).toBe(0)
    })
  })

  describe("precedence", () => {
    it("capture > costResolver > pricing", () => {
      const h = harness({
        costResolver: (usage) => (usage.model === "gpt-4o" ? { total: 0.3 } : undefined),
        pricing: { ...PRICING, "openai/gpt-4o-mini": { inputPer1M: 1, outputPer1M: 1 } },
      })
      capture("captured", () => h.llmCall("by-capture"), { cost: { total: 0.9 } })
      h.llmCall("by-resolver")
      h.llmCall("by-pricing", { "gen_ai.request.model": "gpt-4o-mini" })
      expect(h.attrs("by-capture")[ATTRIBUTES.costTotal]).toBe(0.9)
      expect(h.attrs("by-resolver")[ATTRIBUTES.costTotal]).toBe(0.3)
      expect(h.attrs("by-pricing")[ATTRIBUTES.costTotal]).toBeCloseTo(0.0015)
    })

    it("setLlmCost beats capture, resolver, pricing and later instrumentor writes", () => {
      const h = harness({ costResolver: () => ({ total: 0.3 }), pricing: PRICING })
      capture(
        "agent-run",
        () => {
          const span = h.tracer.startSpan("manual", {
            attributes: {
              "gen_ai.operation.name": "chat",
              "gen_ai.system": "openai",
              "gen_ai.request.model": "gpt-4o",
            },
          })
          setLlmCost(span, { input: 0.01, output: 0.02 })
          // An instrumentor writing cost later must not win over the explicit value.
          span.setAttribute("gen_ai.usage.total_cost", 99)
          span.end()
        },
        { cost: { total: 0.9 } },
      )
      expect(costOf(h.attrs("manual"))).toEqual({
        [ATTRIBUTES.costInput]: 0.01,
        [ATTRIBUTES.costOutput]: 0.02,
        [ATTRIBUTES.costTotal]: 0.03,
        [ATTRIBUTES.costSource]: COST_SOURCE_USER,
      })
    })

    it("setLlmCost writes onto the live span", () => {
      const h = harness()
      const span = h.tracer.startSpan("manual", { attributes: { "gen_ai.operation.name": "chat" } })
      setLlmCost(span, { total: 0 })
      expect((span as unknown as { attributes: Attributes }).attributes).toMatchObject({
        [ATTRIBUTES.costTotal]: 0,
        [ATTRIBUTES.costSource]: COST_SOURCE_USER,
      })
      span.end()
    })

    it("setLlmCost total-only drops the instrumentor's sides at export", () => {
      const h = harness()
      const span = h.tracer.startSpan("manual", {
        attributes: { "gen_ai.usage.input_cost": 5, "gen_ai.usage.output_cost": 5 },
      })
      setLlmCost(span, { total: 0 })
      span.end()
      expect(costOf(h.attrs("manual"))).toEqual({
        [ATTRIBUTES.costTotal]: 0,
        [ATTRIBUTES.costSource]: COST_SOURCE_USER,
      })
    })

    it("setLlmCost without values is a no-op", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      const h = harness()
      const span = h.tracer.startSpan("manual", { attributes: { "gen_ai.operation.name": "chat" } })
      setLlmCost(span, {})
      span.end()
      expect(costOf(h.attrs("manual"))).toEqual({})
    })

    it("trusts a span already marked latitude.cost.source=user", () => {
      const h = harness({ pricing: PRICING })
      h.llmCall("openai.chat", { [ATTRIBUTES.costSource]: COST_SOURCE_USER, "gen_ai.usage.total_cost": 0.7 })
      expect(costOf(h.attrs("openai.chat"))).toEqual({
        [ATTRIBUTES.costTotal]: 0.7,
        [ATTRIBUTES.costSource]: COST_SOURCE_USER,
      })
    })

    it("leaves instrumentor costs alone when the SDK sets nothing", () => {
      const h = harness()
      h.llmCall("openai.chat", { "gen_ai.usage.input_cost": 1, "gen_ai.usage.total_cost": 1.5 })
      expect(costOf(h.attrs("openai.chat"))).toEqual({
        [ATTRIBUTES.costInput]: 1,
        [ATTRIBUTES.costTotal]: 1.5,
      })
    })
  })

  describe("Latitude bootstrap", () => {
    it("wires pricing and costResolver through the constructor", async () => {
      const exporter = new InMemorySpanExporter()
      const latitude = new Latitude({
        apiKey: "fake-api-key",
        project: "p",
        disableBatch: true,
        exporter,
        pricing: PRICING,
        costResolver: (usage) => (usage.model === "special" ? { total: 1 } : undefined),
      })
      const tracer = latitude.provider.getTracer("test.llm")
      for (const [name, model] of [
        ["priced", "gpt-4o"],
        ["resolved", "special"],
      ] as const) {
        tracer
          .startSpan(name, {
            attributes: {
              "gen_ai.operation.name": "chat",
              "gen_ai.system": "openai",
              "gen_ai.request.model": model,
              "gen_ai.usage.input_tokens": 1000,
              "gen_ai.usage.output_tokens": 500,
            },
          })
          .end()
      }
      await latitude.flush()
      const spans = Object.fromEntries(exporter.getFinishedSpans().map((s) => [s.name, s.attributes]))
      expect(spans.priced?.[ATTRIBUTES.costTotal]).toBeCloseTo(0.0075)
      expect(spans.resolved?.[ATTRIBUTES.costTotal]).toBe(1)
      await latitude.shutdown()
    })
  })
})

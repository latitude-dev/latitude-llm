import { beforeAll, describe, expect, it } from "vitest"
import type { SpanDetail } from "../../entities/span.ts"
import type { TransformContext } from "../transform.ts"
import { transformOtlpToSpans } from "../transform.ts"
import type { OtlpExportTraceServiceRequest, OtlpKeyValue, OtlpSpan } from "../types.ts"

// ─── Attribute helpers ────────────────────────────────────
function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}
function int(key: string, value: number): OtlpKeyValue {
  return { key, value: { intValue: String(value) } }
}
function strArray(key: string, values: string[]): OtlpKeyValue {
  return { key, value: { arrayValue: { values: values.map((v) => ({ stringValue: v })) } } }
}

// ─── Trace constants ──────────────────────────────────────
const TRACE_ID = "0af7651916cd43dd8448eb211c80319c"
const SERVICE_NAME = "my-app"
const SCOPE_NAME = "so.latitude.instrumentation.openai"
const SCOPE_VERSION = "0.22.5"

const SPAN_IDS = {
  completion: "a1b2c3d4e5f60001",
  streaming: "a1b2c3d4e5f60002",
} as const

const CONTEXT: TransformContext = {
  organizationId: "org_test",
  projectId: "proj_test",
  apiKeyId: "key_test",
  ingestedAt: new Date("2026-03-16T12:00:00Z"),
}

// ─── Span builders (Traceloop/OpenLLMetry flattened indexed format) ──

function buildCompletionSpan(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.completion,
    name: "openai.chat",
    kind: 3,
    startTimeUnixNano: "1710590400000000000",
    endTimeUnixNano: "1710590401000000000",
    attributes: [
      // Traceloop sends indexed attributes instead of JSON strings
      str("gen_ai.prompt.0.role", "system"),
      str("gen_ai.prompt.0.content", "You are a helpful assistant."),
      str("gen_ai.prompt.1.role", "user"),
      str("gen_ai.prompt.1.content", "Say hello in exactly 5 words."),
      str("gen_ai.completion.0.role", "assistant"),
      str("gen_ai.completion.0.content", "Hello there, how are you!"),
      str("gen_ai.completion.0.finish_reason", "stop"),
      // Standard OpenLLMetry attributes
      str("gen_ai.system", "OpenAI"),
      str("gen_ai.request.model", "gpt-4o-mini"),
      str("gen_ai.response.model", "gpt-4o-mini-2024-07-18"),
      int("gen_ai.usage.prompt_tokens", 24),
      int("gen_ai.usage.completion_tokens", 8),
      str("llm.request.type", "chat"),
      // Latitude baggage attributes
      str("latitude.tags", '["test","openai"]'),
      str("session.id", "example-session"),
    ],
    status: { code: 1 },
  }
}

function buildStreamingSpan(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.streaming,
    name: "openai.chat",
    kind: 3,
    startTimeUnixNano: "1710590401100000000",
    endTimeUnixNano: "1710590402000000000",
    attributes: [
      str("gen_ai.prompt.0.role", "user"),
      str("gen_ai.prompt.0.content", "Tell me a joke."),
      str("gen_ai.completion.0.role", "assistant"),
      str("gen_ai.completion.0.content", "Why did the programmer quit? Because they didn't get arrays!"),
      str("gen_ai.completion.0.finish_reason", "stop"),
      str("gen_ai.system", "OpenAI"),
      str("gen_ai.request.model", "gpt-4o-mini"),
      str("gen_ai.response.model", "gpt-4o-mini-2024-07-18"),
      strArray("gen_ai.response.finish_reasons", ["stop"]),
      int("gen_ai.usage.prompt_tokens", 10),
      int("gen_ai.usage.completion_tokens", 15),
      str("llm.request.type", "chat"),
    ],
    status: { code: 1 },
  }
}

function buildTrace(): OtlpExportTraceServiceRequest {
  return {
    resourceSpans: [
      {
        resource: { attributes: [str("service.name", SERVICE_NAME)] },
        scopeSpans: [
          {
            scope: { name: SCOPE_NAME, version: SCOPE_VERSION },
            spans: [buildCompletionSpan(), buildStreamingSpan()],
          },
        ],
      },
    ],
  }
}

// ─── Tests ────────────────────────────────────────────────

describe("Traceloop/OpenLLMetry — flattened indexed gen_ai.prompt/completion", () => {
  let spans: SpanDetail[]
  const findSpan = (id: keyof typeof SPAN_IDS) => {
    const s = spans.find((s) => s.spanId === SPAN_IDS[id])
    if (!s) throw new Error(`Span ${id} not found`)
    return s
  }

  beforeAll(() => {
    spans = transformOtlpToSpans(buildTrace(), CONTEXT)
  })

  describe("trace structure", () => {
    it("produces 2 spans", () => {
      expect(spans).toHaveLength(2)
    })

    it("all spans share the same traceId", () => {
      for (const s of spans) {
        expect(s.traceId).toBe(TRACE_ID)
      }
    })
  })

  describe("identity and operation", () => {
    it("resolves provider to 'OpenAI'", () => {
      expect(findSpan("completion").provider).toBe("OpenAI")
    })

    it("resolves model to 'gpt-4o-mini'", () => {
      expect(findSpan("completion").model).toBe("gpt-4o-mini")
    })

    it("resolves responseModel", () => {
      expect(findSpan("completion").responseModel).toBe("gpt-4o-mini-2024-07-18")
    })

    it("resolves operation from llm.request.type", () => {
      expect(findSpan("completion").operation).toBe("chat")
    })
  })

  describe("input messages — reassembled from gen_ai.prompt.{i}.*", () => {
    it("completion span has input messages", () => {
      const s = findSpan("completion")
      expect(s.inputMessages.length).toBeGreaterThan(0)
    })

    it("extracts system instructions from system role message", () => {
      const s = findSpan("completion")
      expect(s.systemInstructions.length).toBeGreaterThan(0)
    })

    it("has a user input message with the correct content", () => {
      const s = findSpan("completion")
      const userMsg = s.inputMessages.find((m) => m.role === "user")
      expect(userMsg).toBeDefined()
      const parts = (userMsg as { parts: { type: string; content?: string }[] }).parts
      const textPart = parts.find((p) => p.type === "text")
      expect(textPart).toBeDefined()
      expect((textPart as { content: string }).content).toContain("5 words")
    })

    it("streaming span has a user input message", () => {
      const s = findSpan("streaming")
      const userMsg = s.inputMessages.find((m) => m.role === "user")
      expect(userMsg).toBeDefined()
      const parts = (userMsg as { parts: { type: string; content?: string }[] }).parts
      const textPart = parts.find((p) => p.type === "text")
      expect(textPart).toBeDefined()
      expect((textPart as { content: string }).content).toContain("joke")
    })
  })

  describe("output messages — reassembled from gen_ai.completion.{i}.*", () => {
    it("completion span has output messages", () => {
      const s = findSpan("completion")
      expect(s.outputMessages.length).toBeGreaterThan(0)
    })

    it("output has an assistant message with text content", () => {
      const s = findSpan("completion")
      const assistant = s.outputMessages.find((m) => m.role === "assistant")
      expect(assistant).toBeDefined()
      const parts = (assistant as { parts: { type: string; content?: string }[] }).parts
      const textPart = parts.find((p) => p.type === "text")
      expect(textPart).toBeDefined()
      expect((textPart as { content: string }).content).toContain("Hello")
    })

    it("streaming span has an assistant output message", () => {
      const s = findSpan("streaming")
      const assistant = s.outputMessages.find((m) => m.role === "assistant")
      expect(assistant).toBeDefined()
      const parts = (assistant as { parts: { type: string; content?: string }[] }).parts
      const textPart = parts.find((p) => p.type === "text")
      expect(textPart).toBeDefined()
      expect((textPart as { content: string }).content).toContain("arrays")
    })
  })

  describe("token usage", () => {
    it("completion span has correct token counts", () => {
      const s = findSpan("completion")
      expect(s.tokensInput).toBe(24)
      expect(s.tokensOutput).toBe(8)
    })

    it("streaming span has correct token counts", () => {
      const s = findSpan("streaming")
      expect(s.tokensInput).toBe(10)
      expect(s.tokensOutput).toBe(15)
    })
  })

  describe("baggage attributes", () => {
    it("resolves tags from latitude.tags", () => {
      expect(findSpan("completion").tags).toEqual(["test", "openai"])
    })

    it("resolves sessionId from session.id", () => {
      expect(findSpan("completion").sessionId).toBe("example-session")
    })

    it("spans without baggage attributes have empty defaults", () => {
      expect(findSpan("streaming").tags).toEqual([])
      expect(findSpan("streaming").sessionId).toBe("")
    })
  })

  describe("finish reasons", () => {
    it("streaming span resolves finish_reasons from array attribute", () => {
      expect(findSpan("streaming").finishReasons).toEqual(["stop"])
    })
  })
})

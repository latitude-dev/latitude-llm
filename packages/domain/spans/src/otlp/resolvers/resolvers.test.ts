import { describe, expect, it } from "vitest"
import type { OtlpKeyValue } from "../types.ts"
import { first, fromFloat, fromInt, fromString, fromStringArray, resolveAttributes } from "./index.ts"

function strAttr(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}

function intAttr(key: string, value: number): OtlpKeyValue {
  return { key, value: { intValue: String(value) } }
}

function floatAttr(key: string, value: number): OtlpKeyValue {
  return { key, value: { doubleValue: value } }
}

function arrayAttr(key: string, values: string[]): OtlpKeyValue {
  return {
    key,
    value: {
      arrayValue: {
        values: values.map((v) => ({ stringValue: v })),
      },
    },
  }
}

describe("candidate resolution", () => {
  describe("first()", () => {
    it("returns the first matching candidate value", () => {
      const candidates = [fromString("key1"), fromString("key2")]
      const attrs: OtlpKeyValue[] = [strAttr("key2", "found")]

      expect(first(candidates, attrs)).toBe("found")
    })

    it("returns the first match when multiple candidates match", () => {
      const candidates = [fromString("key1"), fromString("key2")]
      const attrs: OtlpKeyValue[] = [strAttr("key1", "first"), strAttr("key2", "second")]

      expect(first(candidates, attrs)).toBe("first")
    })

    it("returns undefined when no candidate matches", () => {
      const candidates = [fromString("key1")]
      const attrs: OtlpKeyValue[] = [strAttr("other", "value")]

      expect(first(candidates, attrs)).toBeUndefined()
    })
  })

  describe("fromString", () => {
    it("resolves string value", () => {
      const candidate = fromString("key")
      expect(candidate.resolve([strAttr("key", "value")])).toBe("value")
    })

    it("applies transform", () => {
      const candidate = fromString("key", (v) => v.toUpperCase())
      expect(candidate.resolve([strAttr("key", "hello")])).toBe("HELLO")
    })

    it("returns undefined for missing key", () => {
      const candidate = fromString("key")
      expect(candidate.resolve([])).toBeUndefined()
    })
  })

  describe("fromInt", () => {
    it("resolves integer value", () => {
      const candidate = fromInt("tokens")
      expect(candidate.resolve([intAttr("tokens", 150)])).toBe(150)
    })

    it("rounds double values for int candidates", () => {
      const candidate = fromInt("tokens")
      expect(candidate.resolve([floatAttr("tokens", 99.7)])).toBe(100)
    })
  })

  describe("fromFloat", () => {
    it("resolves float value", () => {
      const candidate = fromFloat("cost")
      expect(candidate.resolve([floatAttr("cost", 0.0025)])).toBe(0.0025)
    })

    it("applies transform", () => {
      const candidate = fromFloat("cost", (v) => v * 100)
      expect(candidate.resolve([floatAttr("cost", 0.5)])).toBe(50)
    })
  })

  describe("fromStringArray", () => {
    it("resolves string array value", () => {
      const candidate = fromStringArray("reasons")
      expect(candidate.resolve([arrayAttr("reasons", ["stop", "length"])])).toEqual(["stop", "length"])
    })
  })
})

describe("resolveAttributes", () => {
  describe("provider resolution", () => {
    it("resolves from gen_ai.provider.name", () => {
      const attrs: OtlpKeyValue[] = [strAttr("gen_ai.provider.name", "openai")]
      const result = resolveAttributes(attrs, "unset")
      expect(result.provider).toBe("openai")
    })

    it("resolves from gen_ai.system (deprecated)", () => {
      const attrs: OtlpKeyValue[] = [strAttr("gen_ai.system", "anthropic")]
      const result = resolveAttributes(attrs, "unset")
      expect(result.provider).toBe("anthropic")
    })

    it("resolves from OpenInference llm.system", () => {
      const attrs: OtlpKeyValue[] = [strAttr("llm.system", "openai")]
      const result = resolveAttributes(attrs, "unset")
      expect(result.provider).toBe("openai")
    })

    it("resolves from Vercel ai.model.provider and strips suffix", () => {
      const attrs: OtlpKeyValue[] = [strAttr("ai.model.provider", "openai.chat")]
      const result = resolveAttributes(attrs, "unset")
      expect(result.provider).toBe("openai")
    })

    it("normalizes provider aliases", () => {
      const cases: [string, string, string][] = [
        ["gen_ai.system", "bedrock", "amazon-bedrock"],
        ["gen_ai.system", "gemini", "google"],
        ["gen_ai.system", "vertexai", "google-vertex"],
        ["gen_ai.system", "mistralai", "mistral"],
        ["gen_ai.system", "mistral_ai", "mistral"],
        ["ai.model.provider", "google.vertex.chat", "google-vertex"],
        ["ai.model.provider", "anthropic.messages", "anthropic"],
        ["ai.model.provider", "google.generative-ai", "google"],
      ]

      for (const [key, input, expected] of cases) {
        const attrs: OtlpKeyValue[] = [strAttr(key, input)]
        const result = resolveAttributes(attrs, "unset")
        expect(result.provider).toBe(expected)
      }
    })

    it("returns empty string for missing provider", () => {
      const result = resolveAttributes([], "unset")
      expect(result.provider).toBe("")
    })
  })

  describe("model resolution", () => {
    it("resolves from gen_ai.request.model", () => {
      const attrs: OtlpKeyValue[] = [strAttr("gen_ai.request.model", "gpt-4o")]
      const result = resolveAttributes(attrs, "unset")
      expect(result.model).toBe("gpt-4o")
    })

    it("resolves from OpenInference llm.model_name", () => {
      const attrs: OtlpKeyValue[] = [strAttr("llm.model_name", "claude-3-opus")]
      const result = resolveAttributes(attrs, "unset")
      expect(result.model).toBe("claude-3-opus")
    })

    it("resolves from Vercel ai.model.id", () => {
      const attrs: OtlpKeyValue[] = [strAttr("ai.model.id", "gpt-4o-mini")]
      const result = resolveAttributes(attrs, "unset")
      expect(result.model).toBe("gpt-4o-mini")
    })

    it("resolves from embedding.model_name", () => {
      const attrs: OtlpKeyValue[] = [strAttr("embedding.model_name", "text-embedding-3-small")]
      const result = resolveAttributes(attrs, "unset")
      expect(result.model).toBe("text-embedding-3-small")
    })
  })

  describe("response model resolution", () => {
    it("resolves from gen_ai.response.model", () => {
      const attrs: OtlpKeyValue[] = [strAttr("gen_ai.response.model", "gpt-4o-2024-05-13")]
      const result = resolveAttributes(attrs, "unset")
      expect(result.responseModel).toBe("gpt-4o-2024-05-13")
    })

    it("resolves from ai.response.model", () => {
      const attrs: OtlpKeyValue[] = [strAttr("ai.response.model", "gpt-4o-mini")]
      const result = resolveAttributes(attrs, "unset")
      expect(result.responseModel).toBe("gpt-4o-mini")
    })
  })

  describe("operation resolution", () => {
    it("resolves from gen_ai.operation.name", () => {
      const attrs: OtlpKeyValue[] = [strAttr("gen_ai.operation.name", "chat")]
      const result = resolveAttributes(attrs, "unset")
      expect(result.operation).toBe("chat")
    })

    it("maps OpenInference span kinds to operation names", () => {
      const cases: [string, string][] = [
        ["LLM", "chat"],
        ["EMBEDDING", "embeddings"],
        ["RETRIEVER", "retrieval"],
        ["TOOL", "execute_tool"],
        ["AGENT", "invoke_agent"],
        ["CHAIN", "chain"],
        ["RERANKER", "reranker"],
        ["GUARDRAIL", "guardrail"],
      ]

      for (const [kind, expected] of cases) {
        const attrs: OtlpKeyValue[] = [strAttr("openinference.span.kind", kind)]
        const result = resolveAttributes(attrs, "unset")
        expect(result.operation).toBe(expected)
      }
    })

    it("maps OpenLLMetry request types", () => {
      const cases: [string, string][] = [
        ["chat", "chat"],
        ["completion", "text_completion"],
        ["embedding", "embeddings"],
        ["rerank", "reranker"],
      ]

      for (const [type, expected] of cases) {
        const attrs: OtlpKeyValue[] = [strAttr("llm.request.type", type)]
        const result = resolveAttributes(attrs, "unset")
        expect(result.operation).toBe(expected)
      }
    })

    it("maps Vercel operation IDs", () => {
      const cases: [string, string][] = [
        ["ai.generateText", "chat"],
        ["ai.generateText.doGenerate", "chat"],
        ["ai.streamText", "chat"],
        ["ai.streamText.doStream", "chat"],
        ["ai.generateObject", "chat"],
        ["ai.embed", "embeddings"],
        ["ai.toolCall", "execute_tool"],
      ]

      for (const [opId, expected] of cases) {
        const attrs: OtlpKeyValue[] = [strAttr("ai.operationId", opId)]
        const result = resolveAttributes(attrs, "unset")
        expect(result.operation).toBe(expected)
      }
    })
  })

  describe("token usage resolution", () => {
    it("resolves GenAI current token counts", () => {
      const attrs: OtlpKeyValue[] = [
        intAttr("gen_ai.usage.input_tokens", 100),
        intAttr("gen_ai.usage.output_tokens", 50),
      ]
      const result = resolveAttributes(attrs, "unset")
      expect(result.tokensInput).toBe(100)
      expect(result.tokensOutput).toBe(50)
    })

    it("resolves GenAI deprecated token counts", () => {
      const attrs: OtlpKeyValue[] = [
        intAttr("gen_ai.usage.prompt_tokens", 200),
        intAttr("gen_ai.usage.completion_tokens", 75),
      ]
      const result = resolveAttributes(attrs, "unset")
      expect(result.tokensInput).toBe(200)
      expect(result.tokensOutput).toBe(75)
    })

    it("resolves OpenInference token counts", () => {
      const attrs: OtlpKeyValue[] = [intAttr("llm.token_count.prompt", 300), intAttr("llm.token_count.completion", 100)]
      const result = resolveAttributes(attrs, "unset")
      expect(result.tokensInput).toBe(300)
      expect(result.tokensOutput).toBe(100)
    })

    it("resolves Vercel AI token counts", () => {
      const attrs: OtlpKeyValue[] = [intAttr("ai.usage.promptTokens", 500), intAttr("ai.usage.completionTokens", 200)]
      const result = resolveAttributes(attrs, "unset")
      expect(result.tokensInput).toBe(500)
      expect(result.tokensOutput).toBe(200)
    })

    it("resolves cache and reasoning tokens", () => {
      const attrs: OtlpKeyValue[] = [
        intAttr("gen_ai.usage.input_tokens", 1000),
        intAttr("gen_ai.usage.output_tokens", 500),
        intAttr("gen_ai.usage.cache_read.input_tokens", 800),
        intAttr("gen_ai.usage.cache_creation.input_tokens", 200),
        intAttr("gen_ai.usage.reasoning_tokens", 100),
      ]
      const result = resolveAttributes(attrs, "unset")
      expect(result.tokensCacheRead).toBe(800)
      expect(result.tokensCacheCreate).toBe(200)
      expect(result.tokensReasoning).toBe(100)
    })

    it("resolves OpenInference cache/reasoning tokens", () => {
      const attrs: OtlpKeyValue[] = [
        intAttr("llm.token_count.prompt", 1000),
        intAttr("llm.token_count.completion", 500),
        intAttr("llm.token_count.prompt_details.cache_read", 700),
        intAttr("llm.token_count.prompt_details.cache_write", 100),
        intAttr("llm.token_count.completion_details.reasoning", 200),
      ]
      const result = resolveAttributes(attrs, "unset")
      expect(result.tokensCacheRead).toBe(700)
      expect(result.tokensCacheCreate).toBe(100)
      expect(result.tokensReasoning).toBe(200)
    })

    it("defaults all token counts to zero when missing", () => {
      const result = resolveAttributes([], "unset")
      expect(result.tokensInput).toBe(0)
      expect(result.tokensOutput).toBe(0)
      expect(result.tokensCacheRead).toBe(0)
      expect(result.tokensCacheCreate).toBe(0)
      expect(result.tokensReasoning).toBe(0)
    })
  })

  describe("cost resolution", () => {
    it("resolves explicit costs from OpenInference attributes", () => {
      const attrs: OtlpKeyValue[] = [
        intAttr("gen_ai.usage.input_tokens", 100),
        intAttr("gen_ai.usage.output_tokens", 50),
        floatAttr("llm.cost.prompt", 0.001),
        floatAttr("llm.cost.completion", 0.002),
      ]
      const result = resolveAttributes(attrs, "unset")
      expect(result.costInputMicrocents).toBe(100_000)
      expect(result.costOutputMicrocents).toBe(200_000)
      expect(result.costIsEstimated).toBe(false)
    })

    it("resolves explicit total cost", () => {
      const attrs: OtlpKeyValue[] = [
        intAttr("gen_ai.usage.input_tokens", 100),
        intAttr("gen_ai.usage.output_tokens", 50),
        floatAttr("llm.cost.prompt", 0.001),
        floatAttr("llm.cost.completion", 0.002),
        floatAttr("llm.cost.total", 0.005),
      ]
      const result = resolveAttributes(attrs, "unset")
      expect(result.costTotalMicrocents).toBe(500_000)
    })

    it("defaults costs to zero when no cost attributes and model is unknown", () => {
      const attrs: OtlpKeyValue[] = [
        intAttr("gen_ai.usage.input_tokens", 100),
        intAttr("gen_ai.usage.output_tokens", 50),
      ]
      const result = resolveAttributes(attrs, "unset")
      expect(result.costTotalMicrocents).toBe(0)
    })
  })

  describe("response metadata", () => {
    it("resolves response ID", () => {
      const attrs: OtlpKeyValue[] = [strAttr("gen_ai.response.id", "chatcmpl-abc123")]
      const result = resolveAttributes(attrs, "unset")
      expect(result.responseId).toBe("chatcmpl-abc123")
    })

    it("resolves Vercel response ID", () => {
      const attrs: OtlpKeyValue[] = [strAttr("ai.response.id", "resp-xyz")]
      const result = resolveAttributes(attrs, "unset")
      expect(result.responseId).toBe("resp-xyz")
    })

    it("resolves finish reasons from GenAI array", () => {
      const attrs: OtlpKeyValue[] = [arrayAttr("gen_ai.response.finish_reasons", ["stop"])]
      const result = resolveAttributes(attrs, "unset")
      expect(result.finishReasons).toEqual(["stop"])
    })

    it("resolves Vercel singular finishReason and normalizes", () => {
      const cases: [string, string][] = [
        ["stop", "stop"],
        ["length", "length"],
        ["tool-calls", "tool_calls"],
        ["content-filter", "content_filter"],
      ]

      for (const [vercelReason, expected] of cases) {
        const attrs: OtlpKeyValue[] = [strAttr("ai.response.finishReason", vercelReason)]
        const result = resolveAttributes(attrs, "unset")
        expect(result.finishReasons).toEqual([expected])
      }
    })
  })

  describe("session ID resolution", () => {
    it("resolves from gen_ai.conversation.id", () => {
      const attrs: OtlpKeyValue[] = [strAttr("gen_ai.conversation.id", "conv-123")]
      const result = resolveAttributes(attrs, "unset")
      expect(result.sessionId).toBe("conv-123")
    })

    it("resolves from OpenInference session.id", () => {
      const attrs: OtlpKeyValue[] = [strAttr("session.id", "sess-456")]
      const result = resolveAttributes(attrs, "unset")
      expect(result.sessionId).toBe("sess-456")
    })
  })

  describe("error type", () => {
    it("resolves error.type when status is error", () => {
      const attrs: OtlpKeyValue[] = [strAttr("error.type", "TimeoutError")]
      const result = resolveAttributes(attrs, "error")
      expect(result.errorType).toBe("TimeoutError")
    })

    it("returns empty string when status is not error", () => {
      const attrs: OtlpKeyValue[] = [strAttr("error.type", "TimeoutError")]
      const result = resolveAttributes(attrs, "ok")
      expect(result.errorType).toBe("")
    })
  })
})

import { describe, expect, it } from "vitest"
import type { OtlpEvent, OtlpKeyValue } from "../types.ts"
import { resolveAttributes } from "./index.ts"
import { resolvePerformance } from "./performance.ts"
import { resolveStatusCode } from "./status.ts"
import { resolveToolExecution } from "./tool-execution.ts"
import { resolveUsage } from "./usage.ts"
import { first, fromFloat, fromInt, fromString, fromStringArray } from "./utils.ts"

function strAttr(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}

function intAttr(key: string, value: number): OtlpKeyValue {
  return { key, value: { intValue: String(value) } }
}

function floatAttr(key: string, value: number): OtlpKeyValue {
  return { key, value: { doubleValue: value } }
}

function boolAttr(key: string, value: boolean): OtlpKeyValue {
  return { key, value: { boolValue: value } }
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

function kvlistAttr(key: string, values: Record<string, string | number>): OtlpKeyValue {
  return {
    key,
    value: {
      kvlistValue: {
        values: Object.entries(values).map(([k, v]) => ({
          key: k,
          value:
            typeof v === "string"
              ? { stringValue: v }
              : Number.isInteger(v)
                ? { intValue: String(v) }
                : { doubleValue: v },
        })),
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
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.provider).toBe("openai")
    })

    it("resolves from gen_ai.system (deprecated)", () => {
      const attrs: OtlpKeyValue[] = [strAttr("gen_ai.system", "anthropic")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.provider).toBe("anthropic")
    })

    it("resolves from OpenInference llm.system", () => {
      const attrs: OtlpKeyValue[] = [strAttr("llm.system", "openai")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.provider).toBe("openai")
    })

    it("resolves from OpenInference llm.provider (DSPy, no llm.system)", () => {
      const attrs: OtlpKeyValue[] = [strAttr("llm.provider", "openai")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.provider).toBe("openai")
    })

    it("resolves from OpenInference LangChain metadata (ls_provider)", () => {
      const attrs: OtlpKeyValue[] = [
        strAttr("metadata", JSON.stringify({ ls_provider: "openai", ls_model_name: "gpt-5.5" })),
      ]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.provider).toBe("openai")
    })

    it("case-folds non-canonical provider casing", () => {
      const cases: [string, string, string][] = [
        ["gen_ai.system", "Google", "google"],
        ["llm.system", "OpenAI", "openai"],
        ["llm.provider", "Anthropic", "anthropic"],
      ]
      for (const [key, input, expected] of cases) {
        const attrs: OtlpKeyValue[] = [strAttr(key, input)]
        const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
        expect(result.provider).toBe(expected)
      }
    })

    it("resolves from Vercel ai.model.provider and strips suffix", () => {
      const attrs: OtlpKeyValue[] = [strAttr("ai.model.provider", "openai.chat")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
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
        // Vercel AI SDK v7 (@ai-sdk/otel) OTel GenAI well-known provider names
        ["gen_ai.provider.name", "gcp.vertex_ai", "google-vertex"],
        ["gen_ai.provider.name", "gcp.gemini", "google"],
        ["gen_ai.provider.name", "aws.bedrock", "amazon-bedrock"],
        ["gen_ai.provider.name", "azure.ai.openai", "azure"],
        ["gen_ai.provider.name", "azure.ai.inference", "azure"],
        ["gen_ai.provider.name", "mistral_ai", "mistral"],
        ["gen_ai.provider.name", "x_ai", "xai"],
        // Google ADK (OpenInference) reports the Vertex agent provider name
        ["llm.provider", "gcp.vertex.agent", "google-vertex"],
        // v7 also passes these through unchanged (already canonical)
        ["gen_ai.provider.name", "openai", "openai"],
        ["gen_ai.provider.name", "anthropic", "anthropic"],
      ]

      for (const [key, input, expected] of cases) {
        const attrs: OtlpKeyValue[] = [strAttr(key, input)]
        const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
        expect(result.provider).toBe(expected)
      }
    })

    it("returns empty string for missing provider", () => {
      const result = resolveAttributes({ spanAttrs: [], statusCode: "unset" })
      expect(result.provider).toBe("")
    })
  })

  describe("model resolution", () => {
    it("resolves from gen_ai.request.model", () => {
      const attrs: OtlpKeyValue[] = [strAttr("gen_ai.request.model", "gpt-4o")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.model).toBe("gpt-4o")
    })

    it("resolves from OpenInference llm.model_name", () => {
      const attrs: OtlpKeyValue[] = [strAttr("llm.model_name", "claude-3-opus")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.model).toBe("claude-3-opus")
    })

    it("resolves from Vercel ai.model.id", () => {
      const attrs: OtlpKeyValue[] = [strAttr("ai.model.id", "gpt-4o-mini")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.model).toBe("gpt-4o-mini")
    })

    it("resolves from embedding.model_name", () => {
      const attrs: OtlpKeyValue[] = [strAttr("embedding.model_name", "text-embedding-3-small")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.model).toBe("text-embedding-3-small")
    })
  })

  describe("response model resolution", () => {
    it("resolves from gen_ai.response.model", () => {
      const attrs: OtlpKeyValue[] = [strAttr("gen_ai.response.model", "gpt-4o-2024-05-13")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.responseModel).toBe("gpt-4o-2024-05-13")
    })

    it("resolves from ai.response.model", () => {
      const attrs: OtlpKeyValue[] = [strAttr("ai.response.model", "gpt-4o-mini")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.responseModel).toBe("gpt-4o-mini")
    })
  })

  describe("operation resolution", () => {
    it("resolves from gen_ai.operation.name", () => {
      const attrs: OtlpKeyValue[] = [strAttr("gen_ai.operation.name", "chat")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.operation).toBe("chat")
    })

    it("maps GenAI operation names emitted by Vercel AI SDK v7 (@ai-sdk/otel)", () => {
      const cases: [string, string][] = [
        ["invoke_agent", "invoke_agent"],
        ["chat", "chat"],
        ["execute_tool", "execute_tool"],
        ["embeddings", "embeddings"],
        ["rerank", "reranker"], // normalized to our Operation literal
      ]

      for (const [name, expected] of cases) {
        const attrs: OtlpKeyValue[] = [strAttr("gen_ai.operation.name", name)]
        const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
        expect(result.operation).toBe(expected)
      }
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
        const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
        expect(result.operation).toBe(expected)
      }
    })

    it("maps OpenClaw diagnostics-otel run/tool spans by name (scope `openclaw`)", () => {
      expect(
        resolveAttributes({ spanAttrs: [], statusCode: "unset", spanName: "openclaw.run", scopeName: "openclaw" })
          .operation,
      ).toBe("invoke_agent")
      expect(
        resolveAttributes({
          spanAttrs: [strAttr("gen_ai.tool.name", "bash")],
          statusCode: "unset",
          spanName: "openclaw.tool.execution",
          scopeName: "openclaw",
        }).operation,
      ).toBe("execute_tool")
      // model.call keeps its gen_ai.operation.name (not overridden by the scope map).
      expect(
        resolveAttributes({
          spanAttrs: [strAttr("gen_ai.operation.name", "chat")],
          statusCode: "unset",
          spanName: "openclaw.model.call",
          scopeName: "openclaw",
        }).operation,
      ).toBe("chat")
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
        const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
        expect(result.operation).toBe(expected)
      }
    })

    it("maps Vercel operation IDs (bare wrappers → invoke_agent, leaves → chat)", () => {
      const cases: [string, string][] = [
        // Bare wrappers carry a lossy summary and end after their leaves —
        // classified as inert wrappers so the rollup excludes them.
        ["ai.generateText", "invoke_agent"],
        ["ai.streamText", "invoke_agent"],
        ["ai.generateObject", "invoke_agent"],
        ["ai.streamObject", "invoke_agent"],
        // Leaves hold the faithful per-call exchange.
        ["ai.generateText.doGenerate", "chat"],
        ["ai.streamText.doStream", "chat"],
        ["ai.generateObject.doGenerate", "chat"],
        ["ai.streamObject.doStream", "chat"],
        ["ai.embed", "embeddings"],
        ["ai.embed.doEmbed", "embeddings"],
        ["ai.toolCall", "execute_tool"],
      ]

      for (const [opId, expected] of cases) {
        const attrs: OtlpKeyValue[] = [strAttr("ai.operationId", opId)]
        const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
        expect(result.operation).toBe(expected)
      }
    })

    it("maps Latitude openai-agents bridge span kinds", () => {
      const cases: [string, string][] = [
        ["agents.function", "execute_tool"],
        ["agents.agent", "invoke_agent"],
        ["agents.trace", "invoke_agent"],
        ["agents.handoff", "invoke_agent"],
        ["agents.guardrail", "guardrail"],
      ]

      for (const [kind, expected] of cases) {
        const attrs: OtlpKeyValue[] = [strAttr("latitude.span.kind", kind)]
        const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
        expect(result.operation).toBe(expected)
      }
    })

    it("prefers gen_ai.operation.name over latitude.span.kind on the bridge LLM span", () => {
      // The bridge's generation/response spans carry both attributes; the
      // standard GenAI op must win so they resolve to `chat`, not the wrapper kind.
      const attrs: OtlpKeyValue[] = [
        strAttr("gen_ai.operation.name", "chat"),
        strAttr("latitude.span.kind", "agents.generation"),
      ]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.operation).toBe("chat")
    })
  })

  describe("token usage resolution", () => {
    it("resolves GenAI current token counts", () => {
      const attrs: OtlpKeyValue[] = [
        intAttr("gen_ai.usage.input_tokens", 100),
        intAttr("gen_ai.usage.output_tokens", 50),
      ]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.tokensInput).toBe(100)
      expect(result.tokensOutput).toBe(50)
    })

    it("resolves GenAI deprecated token counts", () => {
      const attrs: OtlpKeyValue[] = [
        intAttr("gen_ai.usage.prompt_tokens", 200),
        intAttr("gen_ai.usage.completion_tokens", 75),
      ]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.tokensInput).toBe(200)
      expect(result.tokensOutput).toBe(75)
    })

    it("resolves OpenInference token counts", () => {
      const attrs: OtlpKeyValue[] = [intAttr("llm.token_count.prompt", 300), intAttr("llm.token_count.completion", 100)]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.tokensInput).toBe(300)
      expect(result.tokensOutput).toBe(100)
    })

    it("resolves Vercel AI token counts", () => {
      const attrs: OtlpKeyValue[] = [intAttr("ai.usage.promptTokens", 500), intAttr("ai.usage.completionTokens", 200)]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.tokensInput).toBe(500)
      expect(result.tokensOutput).toBe(200)
    })

    it("resolves Vercel AI Responses-style inputTokens / outputTokens", () => {
      const attrs: OtlpKeyValue[] = [
        intAttr("ai.usage.inputTokens", 9191),
        intAttr("ai.usage.outputTokens", 93),
        intAttr("ai.usage.cachedInputTokens", 4429),
        intAttr("ai.usage.inputTokenDetails.cacheWriteTokens", 4761),
      ]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.tokensInput).toBe(1)
      expect(result.tokensCacheRead).toBe(4429)
      expect(result.tokensCacheCreate).toBe(4761)
      expect(result.tokensOutput).toBe(93)
    })

    it("resolves cache and reasoning tokens", () => {
      const attrs: OtlpKeyValue[] = [
        intAttr("gen_ai.usage.input_tokens", 1000),
        intAttr("gen_ai.usage.output_tokens", 500),
        intAttr("gen_ai.usage.cache_read.input_tokens", 800),
        intAttr("gen_ai.usage.cache_creation.input_tokens", 200),
        intAttr("gen_ai.usage.reasoning_tokens", 100),
      ]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
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
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.tokensCacheRead).toBe(700)
      expect(result.tokensCacheCreate).toBe(100)
      expect(result.tokensReasoning).toBe(200)
    })

    it("defaults all token counts to zero when missing", () => {
      const result = resolveAttributes({ spanAttrs: [], statusCode: "unset" })
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
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
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
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.costTotalMicrocents).toBe(500_000)
    })

    it("defaults costs to zero when no cost attributes and model is unknown", () => {
      const attrs: OtlpKeyValue[] = [
        intAttr("gen_ai.usage.input_tokens", 100),
        intAttr("gen_ai.usage.output_tokens", 50),
      ]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.costTotalMicrocents).toBe(0)
    })

    it("estimates cost for Google ADK gcp.vertex.agent provider after alias", () => {
      const attrs: OtlpKeyValue[] = [
        strAttr("llm.provider", "gcp.vertex.agent"),
        strAttr("llm.model_name", "gemini-2.5-flash"),
        intAttr("gen_ai.usage.input_tokens", 100),
        intAttr("gen_ai.usage.output_tokens", 50),
      ]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.provider).toBe("google-vertex")
      expect(result.costIsEstimated).toBe(true)
      expect(result.costTotalMicrocents).toBeGreaterThan(0)
    })
  })

  describe("response metadata", () => {
    it("resolves response ID", () => {
      const attrs: OtlpKeyValue[] = [strAttr("gen_ai.response.id", "chatcmpl-abc123")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.responseId).toBe("chatcmpl-abc123")
    })

    it("resolves Vercel response ID", () => {
      const attrs: OtlpKeyValue[] = [strAttr("ai.response.id", "resp-xyz")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.responseId).toBe("resp-xyz")
    })

    it("resolves finish reasons from GenAI array", () => {
      const attrs: OtlpKeyValue[] = [arrayAttr("gen_ai.response.finish_reasons", ["stop"])]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
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
        const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
        expect(result.finishReasons).toEqual([expected])
      }
    })

    it("resolves OpenInference singular llm.finish_reason", () => {
      const attrs: OtlpKeyValue[] = [strAttr("llm.finish_reason", "tool_calls")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.finishReasons).toEqual(["tool_calls"])
    })
  })

  describe("metadata resolution", () => {
    it("resolves OpenRouter Broadcast trace metadata", () => {
      const attrs: OtlpKeyValue[] = [
        strAttr("trace.metadata.environment", "staging"),
        intAttr("trace.metadata.retry_count", 2),
        boolAttr("trace.metadata.beta", true),
        kvlistAttr("trace.metadata.request", { route: "chat", step: 3 }),
      ]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.metadata).toEqual({
        environment: "staging",
        retry_count: "2",
        beta: "true",
        request: JSON.stringify({ route: "chat", step: 3 }),
      })
    })
  })

  describe("session ID resolution", () => {
    it("resolves from gen_ai.conversation.id", () => {
      const attrs: OtlpKeyValue[] = [strAttr("gen_ai.conversation.id", "conv-123")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.sessionId).toBe("conv-123")
    })

    it("resolves from OpenInference session.id", () => {
      const attrs: OtlpKeyValue[] = [strAttr("session.id", "sess-456")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.sessionId).toBe("sess-456")
    })

    it("resolves from Eve eve.session.id", () => {
      const attrs: OtlpKeyValue[] = [strAttr("eve.session.id", "eve-sess-789")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.sessionId).toBe("eve-sess-789")
    })

    it("falls back to Eve eve.turn.id when no session id is present", () => {
      const attrs: OtlpKeyValue[] = [strAttr("eve.turn.id", "eve-turn-1")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "unset" })
      expect(result.sessionId).toBe("eve-turn-1")
    })
  })

  describe("error type", () => {
    it("resolves error.type when status is error", () => {
      const attrs: OtlpKeyValue[] = [strAttr("error.type", "TimeoutError")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "error" })
      expect(result.errorType).toBe("TimeoutError")
    })

    it("returns empty string when status is not error", () => {
      const attrs: OtlpKeyValue[] = [strAttr("error.type", "TimeoutError")]
      const result = resolveAttributes({ spanAttrs: attrs, statusCode: "ok" })
      expect(result.errorType).toBe("")
    })
  })
})

describe("resolvePerformance", () => {
  describe("TTFT from attributes", () => {
    it("resolves from gen_ai.server.time_to_first_token", () => {
      const result = resolvePerformance({
        spanAttrs: [intAttr("gen_ai.server.time_to_first_token", 500_000_000)],
        events: [],
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.timeToFirstTokenNs).toBe(500_000_000)
    })

    it("resolves from llm.latency.time_to_first_token", () => {
      const result = resolvePerformance({
        spanAttrs: [intAttr("llm.latency.time_to_first_token", 300_000_000)],
        events: [],
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.timeToFirstTokenNs).toBe(300_000_000)
    })

    it("ignores zero TTFT attribute", () => {
      const result = resolvePerformance({
        spanAttrs: [intAttr("gen_ai.server.time_to_first_token", 0)],
        events: [],
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.timeToFirstTokenNs).toBe(0)
    })
  })

  describe("TTFT from events", () => {
    it("computes TTFT from gen_ai.content.completion event timestamp", () => {
      const events: OtlpEvent[] = [{ name: "gen_ai.content.completion", timeUnixNano: "1710590400500000000" }]
      const result = resolvePerformance({
        spanAttrs: [],
        events,
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.timeToFirstTokenNs).toBe(500_000_000)
    })

    it("computes TTFT from gen_ai.choice event (deprecated)", () => {
      const events: OtlpEvent[] = [{ name: "gen_ai.choice", timeUnixNano: "1710590400200000000" }]
      const result = resolvePerformance({
        spanAttrs: [],
        events,
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.timeToFirstTokenNs).toBe(200_000_000)
    })

    it("computes TTFT from ai.stream.firstChunk event timestamp", () => {
      const events: OtlpEvent[] = [{ name: "ai.stream.firstChunk", timeUnixNano: "1710590401200000000" }]
      const result = resolvePerformance({
        spanAttrs: [],
        events,
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.timeToFirstTokenNs).toBe(1_200_000_000)
    })

    it("uses ai.response.msToFirstChunk from event attributes and converts ms to ns", () => {
      const events: OtlpEvent[] = [
        {
          name: "ai.stream.firstChunk",
          timeUnixNano: "1710590401200000000",
          attributes: [floatAttr("ai.response.msToFirstChunk", 1984.1441250005737)],
        },
      ]
      const result = resolvePerformance({
        spanAttrs: [],
        events,
        startTimeUnixNano: "",
      })
      expect(result.timeToFirstTokenNs).toBe(1_984_144_125)
    })

    it("picks the earliest completion event when multiple exist", () => {
      const events: OtlpEvent[] = [
        { name: "gen_ai.content.completion", timeUnixNano: "1710590400800000000" },
        { name: "gen_ai.content.completion", timeUnixNano: "1710590400300000000" },
        { name: "gen_ai.content.completion", timeUnixNano: "1710590400600000000" },
      ]
      const result = resolvePerformance({
        spanAttrs: [],
        events,
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.timeToFirstTokenNs).toBe(300_000_000)
    })

    it("ignores events with missing names or timestamps", () => {
      const events: OtlpEvent[] = [
        { timeUnixNano: "1710590400300000000" },
        { name: "gen_ai.content.completion" },
        { name: "unrelated.event", timeUnixNano: "1710590400100000000" },
      ]
      const result = resolvePerformance({
        spanAttrs: [],
        events,
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.timeToFirstTokenNs).toBe(0)
    })

    it("returns 0 when startTimeUnixNano is empty", () => {
      const events: OtlpEvent[] = [{ name: "gen_ai.content.completion", timeUnixNano: "1710590400300000000" }]
      const result = resolvePerformance({ spanAttrs: [], events, startTimeUnixNano: "" })
      expect(result.timeToFirstTokenNs).toBe(0)
    })
  })

  describe("TTFT precedence", () => {
    it("attribute takes precedence over events", () => {
      const events: OtlpEvent[] = [{ name: "gen_ai.content.completion", timeUnixNano: "1710590400500000000" }]
      const result = resolvePerformance({
        spanAttrs: [intAttr("gen_ai.server.time_to_first_token", 123_000_000)],
        events,
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.timeToFirstTokenNs).toBe(123_000_000)
    })

    it("event TTFT attribute takes precedence over event timestamp delta", () => {
      const events: OtlpEvent[] = [
        {
          name: "ai.stream.firstChunk",
          timeUnixNano: "1710590405000000000",
          attributes: [floatAttr("ai.response.msToFirstChunk", 321)],
        },
      ]
      const result = resolvePerformance({
        spanAttrs: [],
        events,
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.timeToFirstTokenNs).toBe(321_000_000)
    })
  })

  describe("isStreaming detection", () => {
    it("detects streaming from gen_ai.request.stream bool true", () => {
      const result = resolvePerformance({
        spanAttrs: [boolAttr("gen_ai.request.stream", true)],
        events: [],
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.isStreaming).toBe(true)
    })

    it("detects non-streaming from gen_ai.request.stream bool false", () => {
      const result = resolvePerformance({
        spanAttrs: [boolAttr("gen_ai.request.stream", false)],
        events: [],
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.isStreaming).toBe(false)
    })

    it("detects streaming from gen_ai.request.stream string 'true'", () => {
      const result = resolvePerformance({
        spanAttrs: [strAttr("gen_ai.request.stream", "true")],
        events: [],
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.isStreaming).toBe(true)
    })

    it("detects streaming from ai.settings.mode = 'stream'", () => {
      const result = resolvePerformance({
        spanAttrs: [strAttr("ai.settings.mode", "stream")],
        events: [],
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.isStreaming).toBe(true)
    })

    it("does not detect streaming from ai.settings.mode = 'generate'", () => {
      const result = resolvePerformance({
        spanAttrs: [strAttr("ai.settings.mode", "generate")],
        events: [],
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.isStreaming).toBe(false)
    })
  })

  describe("streaming heuristic", () => {
    it("infers streaming when TTFT > 0 and no explicit streaming attribute", () => {
      const events: OtlpEvent[] = [{ name: "gen_ai.content.completion", timeUnixNano: "1710590400500000000" }]
      const result = resolvePerformance({
        spanAttrs: [],
        events,
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.timeToFirstTokenNs).toBe(500_000_000)
      expect(result.isStreaming).toBe(true)
    })

    it("does not infer streaming when TTFT is 0", () => {
      const result = resolvePerformance({
        spanAttrs: [],
        events: [],
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.timeToFirstTokenNs).toBe(0)
      expect(result.isStreaming).toBe(false)
    })
  })

  describe("defaults", () => {
    it("returns zero TTFT and false streaming when no data present", () => {
      const result = resolvePerformance({
        spanAttrs: [],
        events: [],
        startTimeUnixNano: "1710590400000000000",
      })
      expect(result.timeToFirstTokenNs).toBe(0)
      expect(result.isStreaming).toBe(false)
    })
  })
})

describe("resolveToolExecution", () => {
  it("returns empty when operation is not execute_tool", () => {
    const attrs: OtlpKeyValue[] = [
      strAttr("gen_ai.tool.call.id", "call_123"),
      strAttr("gen_ai.tool.name", "get_weather"),
      strAttr("gen_ai.tool.call.arguments", '{"city":"Barcelona"}'),
      strAttr("gen_ai.tool.call.result", '{"temp":22}'),
    ]
    const result = resolveToolExecution(attrs, "chat")
    expect(result.toolCallId).toBe("")
    expect(result.toolName).toBe("")
    expect(result.toolInput).toBe("")
    expect(result.toolOutput).toBe("")
  })

  describe("GenAI v1.37+ convention", () => {
    it("extracts from gen_ai.tool.* string attributes", () => {
      const attrs: OtlpKeyValue[] = [
        strAttr("gen_ai.tool.call.id", "call_weather_1"),
        strAttr("gen_ai.tool.name", "get_weather"),
        strAttr("gen_ai.tool.call.arguments", '{"city":"Barcelona"}'),
        strAttr("gen_ai.tool.call.result", '{"temp":22,"condition":"sunny"}'),
      ]
      const result = resolveToolExecution(attrs, "execute_tool")
      expect(result.toolCallId).toBe("call_weather_1")
      expect(result.toolName).toBe("get_weather")
      expect(result.toolInput).toBe('{"city":"Barcelona"}')
      expect(result.toolOutput).toBe('{"temp":22,"condition":"sunny"}')
    })

    it("handles gen_ai.tool.call.arguments as kvlistValue", () => {
      const attrs: OtlpKeyValue[] = [
        strAttr("gen_ai.tool.call.id", "call_1"),
        strAttr("gen_ai.tool.name", "calculate"),
        kvlistAttr("gen_ai.tool.call.arguments", { a: 23, b: 87 }),
        strAttr("gen_ai.tool.call.result", "2001"),
      ]
      const result = resolveToolExecution(attrs, "execute_tool")
      expect(result.toolCallId).toBe("call_1")
      expect(result.toolName).toBe("calculate")
      // OTLP intValues are strings, so kvlist integers serialize as strings
      expect(result.toolInput).toBe('{"a":"23","b":"87"}')
      expect(result.toolOutput).toBe("2001")
    })

    it("handles gen_ai.tool.call.result as kvlistValue", () => {
      const attrs: OtlpKeyValue[] = [
        strAttr("gen_ai.tool.name", "get_weather"),
        kvlistAttr("gen_ai.tool.call.result", { temp: 22, condition: "sunny" }),
      ]
      const result = resolveToolExecution(attrs, "execute_tool")
      expect(result.toolOutput).toBe('{"temp":"22","condition":"sunny"}')
    })
  })

  describe("Vercel AI SDK convention", () => {
    it("extracts from ai.toolCall.* attributes", () => {
      const attrs: OtlpKeyValue[] = [
        strAttr("ai.toolCall.id", "call_abc"),
        strAttr("ai.toolCall.name", "search"),
        strAttr("ai.toolCall.args", '{"query":"hotels"}'),
        strAttr("ai.toolCall.result", '{"results":[]}'),
      ]
      const result = resolveToolExecution(attrs, "execute_tool")
      expect(result.toolCallId).toBe("call_abc")
      expect(result.toolName).toBe("search")
      expect(result.toolInput).toBe('{"query":"hotels"}')
      expect(result.toolOutput).toBe('{"results":[]}')
    })
  })

  describe("OpenInference convention", () => {
    it("extracts from tool.name, tool_call.id, input.value, output.value", () => {
      const attrs: OtlpKeyValue[] = [
        strAttr("tool_call.id", "call_xyz"),
        strAttr("tool.name", "get_weather"),
        strAttr("input.value", '{"city":"Paris"}'),
        strAttr("output.value", '{"temp":18}'),
      ]
      const result = resolveToolExecution(attrs, "execute_tool")
      expect(result.toolCallId).toBe("call_xyz")
      expect(result.toolName).toBe("get_weather")
      expect(result.toolInput).toBe('{"city":"Paris"}')
      expect(result.toolOutput).toBe('{"temp":18}')
    })
  })

  describe("OpenLLMetry / Traceloop convention", () => {
    it("extracts from traceloop.entity.* attributes", () => {
      const attrs: OtlpKeyValue[] = [
        strAttr("traceloop.entity.name", "get_weather"),
        strAttr("traceloop.entity.input", '{"city":"London"}'),
        strAttr("traceloop.entity.output", '{"temp":15,"rain":true}'),
      ]
      const result = resolveToolExecution(attrs, "execute_tool")
      expect(result.toolName).toBe("get_weather")
      expect(result.toolInput).toBe('{"city":"London"}')
      expect(result.toolOutput).toBe('{"temp":15,"rain":true}')
    })
  })

  describe("Latitude openai-agents TS bridge convention", () => {
    it("extracts from openai.agents.function.* attributes", () => {
      const attrs: OtlpKeyValue[] = [
        strAttr("openai.agents.function.name", "get_weather"),
        strAttr("openai.agents.function.input", '{"city":"Barcelona"}'),
        strAttr("openai.agents.function.output", "The weather in Barcelona is sunny and 22°C."),
      ]
      const result = resolveToolExecution(attrs, "execute_tool")
      expect(result.toolName).toBe("get_weather")
      expect(result.toolInput).toBe('{"city":"Barcelona"}')
      expect(result.toolOutput).toBe("The weather in Barcelona is sunny and 22°C.")
    })
  })

  describe("defaults", () => {
    it("returns empty strings when no matching attributes are present", () => {
      const result = resolveToolExecution([], "execute_tool")
      expect(result.toolCallId).toBe("")
      expect(result.toolName).toBe("")
      expect(result.toolInput).toBe("")
      expect(result.toolOutput).toBe("")
    })
  })
})

describe("resolveUsage — embedded message usage (OpenClaw)", () => {
  // OpenClaw buries usage + provider cost in the assistant message JSON instead
  // of flat gen_ai.usage.* attrs. Tokens are additive (input excludes cache).
  const outputMessages = (usage: unknown) =>
    strAttr("openclaw.content.output_messages", JSON.stringify([{ role: "assistant", content: [], usage }]))

  it("reads additive tokens + provider cost (not estimated), folding cache into input", () => {
    const u = resolveUsage({
      attrs: [
        outputMessages({
          input: 951,
          output: 127,
          cacheRead: 20864,
          cacheWrite: 0,
          reasoningTokens: 0,
          totalTokens: 21942,
          cost: { input: 0.004755, output: 0.00381, cacheRead: 0.010432, cacheWrite: 0, total: 0.018997 },
        }),
      ],
      provider: "openai",
      model: "gpt-5.5",
    })
    expect(u.tokensInput).toBe(951) // additive — not reduced by cache
    expect(u.tokensOutput).toBe(127)
    expect(u.tokensCacheRead).toBe(20864)
    expect(u.tokensCacheCreate).toBe(0)
    expect(u.tokensReasoning).toBe(0)
    expect(u.costInputMicrocents).toBe(1_518_700) // (0.004755 + 0.010432) * 1e8
    expect(u.costOutputMicrocents).toBe(381_000)
    expect(u.costTotalMicrocents).toBe(1_899_700)
    expect(u.costIsEstimated).toBe(false)
  })

  it("falls back to flat gen_ai.usage.* attrs when there is no embedded usage", () => {
    const u = resolveUsage({
      attrs: [intAttr("gen_ai.usage.input_tokens", 100), intAttr("gen_ai.usage.output_tokens", 20)],
      provider: "openai",
      model: "gpt-5.5",
    })
    expect(u.tokensInput).toBe(100)
    expect(u.tokensOutput).toBe(20)
  })

  it("ignores output_messages that carry no usage object", () => {
    const u = resolveUsage({
      attrs: [strAttr("openclaw.content.output_messages", JSON.stringify([{ role: "assistant", content: [] }]))],
      provider: "openai",
      model: "gpt-5.5",
    })
    expect(u.tokensInput).toBe(0)
    expect(u.tokensOutput).toBe(0)
  })
})

describe("resolveStatusCode", () => {
  it("passes the OTel status through for non-OpenClaw scopes", () => {
    expect(resolveStatusCode([], "unset", "openinference")).toBe("unset")
    expect(resolveStatusCode([], "ok", "openinference")).toBe("ok")
    expect(resolveStatusCode([], "error", "openinference")).toBe("error")
  })

  it("treats unset OpenClaw spans as ok (success is signalled out-of-band, not via OTel status)", () => {
    expect(resolveStatusCode([], "unset", "openclaw")).toBe("ok")
    expect(resolveStatusCode([strAttr("openclaw.outcome", "completed")], "unset", "openclaw")).toBe("ok")
  })

  it("keeps OpenClaw spans the plugin explicitly marked as error", () => {
    expect(resolveStatusCode([], "error", "openclaw")).toBe("error")
  })

  it("marks an OpenClaw span as error when its outcome is not a success value", () => {
    expect(resolveStatusCode([strAttr("openclaw.outcome", "error")], "unset", "openclaw")).toBe("error")
    expect(resolveStatusCode([strAttr("openclaw.outcome", "abandoned")], "unset", "openclaw")).toBe("error")
  })

  it("lets a failing outcome override an OTel ok status", () => {
    expect(resolveStatusCode([strAttr("openclaw.outcome", "abandoned")], "ok", "openclaw")).toBe("error")
  })
})

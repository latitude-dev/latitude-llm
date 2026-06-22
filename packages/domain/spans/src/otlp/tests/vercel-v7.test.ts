/**
 * Vercel AI SDK v7 ingestion — GenAI `OpenTelemetry` integration (`@ai-sdk/otel`).
 *
 * Unlike the legacy `ai.*` spans (see vercel.test.ts), v7's recommended integration
 * emits standard OTel GenAI SemConv spans: `gen_ai.operation.name` of
 * `invoke_agent` / `chat` / `execute_tool`, span names `${operation} ${modelId}`,
 * `gen_ai.input.messages` / `gen_ai.output.messages` in `{ role, parts }` form, and
 * provider names mapped to OTel-canonical values (e.g. `gcp.vertex_ai`).
 *
 * These spans flow through `parseGenAICurrent` + the gen_ai.* resolvers. This test
 * locks in that coverage against the exact attribute shapes `@ai-sdk/otel@1.0.0-beta.127`
 * produces, including the v7-only `reasoning` / `blob` / `tool_approval_response` parts
 * and the provider aliasing required for cost estimation.
 */
import { beforeAll, describe, expect, it } from "vitest"
import type { SpanDetail } from "../../entities/span.ts"
import type { TransformContext } from "../transform.ts"
import { transformOtlpToSpans } from "../transform.ts"
import type { OtlpAnyValue, OtlpExportTraceServiceRequest, OtlpKeyValue, OtlpSpan } from "../types.ts"

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}
function int(key: string, value: number): OtlpKeyValue {
  return { key, value: { intValue: String(value) } }
}
function strArray(key: string, values: string[]): OtlpKeyValue {
  return { key, value: { arrayValue: { values: values.map((v) => ({ stringValue: v })) } } }
}
function toOtlpValue(v: unknown): OtlpAnyValue {
  if (typeof v === "string") return { stringValue: v }
  if (typeof v === "boolean") return { boolValue: v }
  if (typeof v === "number") return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toOtlpValue) } }
  if (typeof v === "object" && v !== null) {
    return { kvlistValue: { values: Object.entries(v).map(([key, val]) => ({ key, value: toOtlpValue(val) })) } }
  }
  return {}
}
function structuredAttr(key: string, value: unknown): OtlpKeyValue {
  return { key, value: toOtlpValue(value) }
}

const TRACE_ID = "1bf0651916cd43dd8448eb211c80319c"
const SERVICE_NAME = "v7-travel-planner"
// `@ai-sdk/otel` v7 GenAI integration creates spans on the `gen_ai` tracer.
const SCOPE_NAME = "gen_ai"
const SCOPE_VERSION = "1.0.0-beta.127"
const MODEL = "gpt-4o"
const RESPONSE_MODEL = "gpt-4o-2024-05-13"

const SPAN_IDS = {
  agent: "c7ad6b7169203331",
  chat1: "b1b2c3d4e5f60001",
  getWeather: "b1b2c3d4e5f60002",
  chat2: "b1b2c3d4e5f60003",
} as const

const CONTEXT: TransformContext = {
  organizationId: "org_test",
  apiKeyId: "key_test",
  ingestedAt: new Date("2026-06-18T12:00:00Z"),
  defaultProjectId: "proj_test",
  projectIdBySlug: new Map(),
}

// invoke_agent root span — covers the whole operation.
function buildAgentSpan(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.agent,
    name: `invoke_agent ${MODEL}`,
    kind: 1,
    startTimeUnixNano: "1781784000000000000",
    endTimeUnixNano: "1781784010000000000",
    attributes: [
      str("gen_ai.operation.name", "invoke_agent"),
      str("gen_ai.provider.name", "openai"),
      str("gen_ai.request.model", MODEL),
      str("gen_ai.agent.name", "travel-agent"),
      str("gen_ai.system_instructions", JSON.stringify([{ type: "text", content: "You are a travel agent." }])),
      // The real invoke_agent root span always carries the input conversation too.
      str(
        "gen_ai.input.messages",
        JSON.stringify([{ role: "user", parts: [{ type: "text", content: "What's the weather in Barcelona?" }] }]),
      ),
    ],
    status: { code: 1 },
  }
}

// chat step span — reasoning + text input, tool_call output.
function buildChat1(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.chat1,
    parentSpanId: SPAN_IDS.agent,
    name: `chat ${MODEL}`,
    kind: 3,
    startTimeUnixNano: "1781784000500000000",
    endTimeUnixNano: "1781784001500000000",
    attributes: [
      str("gen_ai.operation.name", "chat"),
      str("gen_ai.provider.name", "openai"),
      str("gen_ai.request.model", MODEL),
      str("gen_ai.response.model", RESPONSE_MODEL),
      str("gen_ai.response.id", "chatcmpl-v7-001"),
      strArray("gen_ai.response.finish_reasons", ["tool_call"]),
      int("gen_ai.usage.input_tokens", 800),
      int("gen_ai.usage.output_tokens", 60),
      int("gen_ai.usage.cache_read.input_tokens", 500),
      structuredAttr("gen_ai.input.messages", [
        {
          role: "user",
          parts: [
            { type: "text", content: "What's the weather in Barcelona?" },
            // v7 emits inline binary file content as `blob` parts (base64).
            { type: "blob", modality: "image", mime_type: "image/png", content: "aGVsbG8=" },
          ],
        },
      ]),
      structuredAttr("gen_ai.output.messages", [
        {
          role: "assistant",
          parts: [
            // v7 emits model thinking as `reasoning` parts.
            { type: "reasoning", content: "The user wants weather; I should call the tool." },
            { type: "text", content: "Let me check the weather." },
            { type: "tool_call", id: "call_weather_1", name: "get_weather", arguments: { city: "Barcelona" } },
          ],
          finish_reason: "tool_call",
        },
      ]),
      str(
        "gen_ai.tool.definitions",
        JSON.stringify([
          {
            type: "function",
            name: "get_weather",
            description: "Get current weather for a city",
            parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
          },
        ]),
      ),
    ],
    status: { code: 1 },
  }
}

// execute_tool span — nested under the chat step.
function buildGetWeatherTool(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.getWeather,
    parentSpanId: SPAN_IDS.chat1,
    name: "execute_tool get_weather",
    kind: 1,
    startTimeUnixNano: "1781784001600000000",
    endTimeUnixNano: "1781784002000000000",
    attributes: [
      str("gen_ai.operation.name", "execute_tool"),
      str("gen_ai.tool.name", "get_weather"),
      str("gen_ai.tool.call.id", "call_weather_1"),
      str("gen_ai.tool.type", "function"),
      structuredAttr("gen_ai.tool.call.arguments", { city: "Barcelona" }),
      str("gen_ai.tool.call.result", '{"temp":22,"condition":"sunny"}'),
    ],
    status: { code: 1 },
  }
}

// Second chat step — tool_call_response + v7-only tool_approval_response input, text output.
function buildChat2(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.chat2,
    parentSpanId: SPAN_IDS.agent,
    name: `chat ${MODEL}`,
    kind: 3,
    startTimeUnixNano: "1781784002100000000",
    endTimeUnixNano: "1781784003500000000",
    attributes: [
      str("gen_ai.operation.name", "chat"),
      str("gen_ai.provider.name", "openai"),
      str("gen_ai.request.model", MODEL),
      str("gen_ai.response.id", "chatcmpl-v7-002"),
      strArray("gen_ai.response.finish_reasons", ["stop"]),
      int("gen_ai.usage.input_tokens", 900),
      int("gen_ai.usage.output_tokens", 40),
      structuredAttr("gen_ai.input.messages", [
        {
          role: "tool",
          parts: [{ type: "tool_call_response", id: "call_weather_1", response: { temp: 22, condition: "sunny" } }],
        },
        {
          role: "user",
          // v7-only part — must pass through (rosetta GenAIGenericPart catch-all).
          parts: [{ type: "tool_approval_response", approval_id: "appr_1", approved: true, reason: "looks good" }],
        },
      ]),
      structuredAttr("gen_ai.output.messages", [
        {
          role: "assistant",
          parts: [{ type: "text", content: "It's 22°C and sunny in Barcelona." }],
          finish_reason: "stop",
        },
      ]),
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
            spans: [buildAgentSpan(), buildChat1(), buildGetWeatherTool(), buildChat2()],
          },
        ],
      },
    ],
  }
}

describe("Vercel AI SDK v7 — GenAI OpenTelemetry (@ai-sdk/otel)", () => {
  let spans: SpanDetail[]
  const findSpan = (id: keyof typeof SPAN_IDS) => {
    const s = spans.find((s) => s.spanId === SPAN_IDS[id])
    if (!s) throw new Error(`Span ${id} not found`)
    return s
  }

  beforeAll(() => {
    spans = transformOtlpToSpans(buildTrace(), CONTEXT).spans as typeof spans
  })

  describe("trace structure and operation", () => {
    it("produces 4 spans", () => {
      expect(spans).toHaveLength(4)
    })

    it("resolves operations from gen_ai.operation.name", () => {
      expect(findSpan("agent").operation).toBe("invoke_agent")
      expect(findSpan("chat1").operation).toBe("chat")
      expect(findSpan("chat2").operation).toBe("chat")
      expect(findSpan("getWeather").operation).toBe("execute_tool")
    })

    it("nests steps under the agent and the tool under its step", () => {
      expect(findSpan("agent").parentSpanId).toBe("")
      expect(findSpan("chat1").parentSpanId).toBe(SPAN_IDS.agent)
      expect(findSpan("getWeather").parentSpanId).toBe(SPAN_IDS.chat1)
    })
  })

  describe("identity, usage, response", () => {
    it("resolves provider and model on chat steps", () => {
      expect(findSpan("chat1").provider).toBe("openai")
      expect(findSpan("chat1").model).toBe(MODEL)
      expect(findSpan("chat1").responseModel).toBe(RESPONSE_MODEL)
    })

    it("splits inclusive input tokens into non-cached + cache (additive)", () => {
      const s = findSpan("chat1")
      expect(s.tokensInput).toBe(300)
      expect(s.tokensCacheRead).toBe(500)
      expect(s.tokensOutput).toBe(60)
      expect(s.tokensInput + s.tokensCacheRead).toBe(800)
    })

    it("resolves response id and finish reasons", () => {
      expect(findSpan("chat1").responseId).toBe("chatcmpl-v7-001")
      expect(findSpan("chat1").finishReasons).toEqual(["tool_call"])
      expect(findSpan("chat2").finishReasons).toEqual(["stop"])
    })
  })

  describe("messages — v7 part types pass through", () => {
    it("preserves reasoning + text + tool_call output parts", () => {
      const assistant = findSpan("chat1").outputMessages.find((m) => m.role === "assistant")
      const parts = (assistant as { parts: { type: string; name?: string }[] }).parts
      expect(parts.some((p) => p.type === "reasoning")).toBe(true)
      expect(parts.some((p) => p.type === "text")).toBe(true)
      const toolCall = parts.find((p) => p.type === "tool_call")
      expect((toolCall as { name: string }).name).toBe("get_weather")
    })

    it("preserves blob input parts", () => {
      const user = findSpan("chat1").inputMessages.find((m) => m.role === "user")
      const parts = (user as { parts: { type: string }[] }).parts
      expect(parts.some((p) => p.type === "blob")).toBe(true)
    })

    it("preserves tool_call_response and the v7-only tool_approval_response part", () => {
      const s = findSpan("chat2")
      const toolMsg = s.inputMessages.find((m) => m.role === "tool")
      expect((toolMsg as { parts: { type: string }[] }).parts.some((p) => p.type === "tool_call_response")).toBe(true)
      const userMsg = s.inputMessages.find((m) => m.role === "user")
      expect((userMsg as { parts: { type: string }[] }).parts.some((p) => p.type === "tool_approval_response")).toBe(
        true,
      )
    })

    it("resolves system instructions and tool definitions", () => {
      expect(findSpan("agent").systemInstructions).toEqual([{ type: "text", content: "You are a travel agent." }])
      expect(findSpan("chat1").toolDefinitions.map((t) => t.name)).toContain("get_weather")
    })
  })

  describe("tool execution", () => {
    it("resolves execute_tool fields from gen_ai.tool.*", () => {
      const s = findSpan("getWeather")
      expect(s.toolName).toBe("get_weather")
      expect(s.toolCallId).toBe("call_weather_1")
      expect(s.toolInput).toBe(JSON.stringify({ city: "Barcelona" }))
      expect(s.toolOutput).toBe('{"temp":22,"condition":"sunny"}')
    })
  })

  describe("provider aliasing for cost (OTel-canonical names)", () => {
    it.each([
      ["gcp.vertex_ai", "google-vertex"],
      ["aws.bedrock", "amazon-bedrock"],
      ["gcp.gemini", "google"],
      ["mistral_ai", "mistral"],
      ["azure.ai.openai", "azure"],
      ["x_ai", "xai"],
    ])("maps gen_ai.provider.name %s -> %s through the full transform", (raw, expected) => {
      const trace: OtlpExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: { attributes: [str("service.name", SERVICE_NAME)] },
            scopeSpans: [
              {
                scope: { name: SCOPE_NAME, version: SCOPE_VERSION },
                spans: [
                  {
                    traceId: TRACE_ID,
                    spanId: "d1d2d3d4e5f60001",
                    name: `chat ${MODEL}`,
                    kind: 3,
                    startTimeUnixNano: "1781784000500000000",
                    endTimeUnixNano: "1781784001500000000",
                    attributes: [
                      str("gen_ai.operation.name", "chat"),
                      str("gen_ai.provider.name", raw),
                      str("gen_ai.request.model", MODEL),
                    ],
                    status: { code: 1 },
                  },
                ],
              },
            ],
          },
        ],
      }
      const { spans } = transformOtlpToSpans(trace, CONTEXT)
      expect(spans[0]?.provider).toBe(expected)
    })
  })
})

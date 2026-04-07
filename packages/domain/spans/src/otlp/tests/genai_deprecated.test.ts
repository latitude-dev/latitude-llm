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
const SESSION_ID = "session-travel-123"
const USER_ID = "user-traceloop-99"
const SERVICE_NAME = "travel-planner"
const SCOPE_NAME = "openllmetry-instrumentor"
const SCOPE_VERSION = "0.9.0"

const SPAN_IDS = {
  agent: "b7ad6b7169203331",
  llmCall1: "a1b2c3d4e5f60001",
  getWeather: "a1b2c3d4e5f60002",
  llmCall2: "a1b2c3d4e5f60003",
  bookHotel: "a1b2c3d4e5f60004",
  searchAttractions: "a1b2c3d4e5f60005",
  llmCall3: "a1b2c3d4e5f60006",
} as const

const MODEL = "gpt-4o"
const RESPONSE_MODEL = "gpt-4o-2024-05-13"
const PROVIDER = "openai"

const SYSTEM_PROMPT =
  "You are a travel planning assistant. Help users plan trips by checking weather, booking hotels, and finding attractions."
const USER_TEXT = "Plan a trip to Barcelona. Here is a photo of the area I want to stay in:"
const FINAL_RESPONSE =
  "Based on the weather (22°C, sunny), I found several attractions. Unfortunately the hotel booking failed, but here are your options..."

const TOOL_DEFS = [
  {
    name: "get_weather",
    description: "Get current weather for a city",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
  },
  {
    name: "book_hotel",
    description: "Book a hotel in a city",
    parameters: {
      type: "object",
      properties: { city: { type: "string" }, checkin: { type: "string" } },
      required: ["city"],
    },
  },
  {
    name: "search_attractions",
    description: "Search tourist attractions",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
  },
]

const CONTEXT: TransformContext = {
  organizationId: "org_test",
  projectId: "proj_test",
  apiKeyId: "key_test",
  ingestedAt: new Date("2026-03-16T12:00:00Z"),
}

// ─── Span builders (GenAI deprecated / OpenLLMetry convention) ──

function buildAgentSpan(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.agent,
    name: "TravelPlanner",
    kind: 1,
    startTimeUnixNano: "1710590400000000000",
    endTimeUnixNano: "1710590410000000000",
    attributes: [
      str("llm.request.type", "agent"),
      str("traceloop.association.properties.user_id", USER_ID),
      str("traceloop.association.properties.env", "staging"),
      str("traceloop.association.properties.version", "2.1"),
    ],
    status: { code: 1 },
  }
}

function buildLlmCall1(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.llmCall1,
    parentSpanId: SPAN_IDS.agent,
    name: "chat gpt-4o",
    kind: 3,
    startTimeUnixNano: "1710590400500000000",
    endTimeUnixNano: "1710590401500000000",
    attributes: [
      str("llm.request.type", "completion"),
      str("gen_ai.system", PROVIDER),
      str("gen_ai.request.model", MODEL),
      str("gen_ai.response.model", RESPONSE_MODEL),
      str("gen_ai.response.id", "chatcmpl-abc001"),
      strArray("gen_ai.response.finish_reasons", ["tool_calls"]),
      str("gen_ai.conversation.id", SESSION_ID),
      int("gen_ai.usage.prompt_tokens", 800),
      int("gen_ai.usage.completion_tokens", 50),
      int("gen_ai.usage.cache_read_input_tokens", 600),
      str(
        "gen_ai.prompt",
        JSON.stringify([
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: USER_TEXT },
        ]),
      ),
      str(
        "gen_ai.completion",
        JSON.stringify([
          {
            role: "assistant",
            content: "Let me check the weather for you.",
            tool_calls: [
              {
                id: "call_weather_1",
                type: "function",
                function: { name: "get_weather", arguments: '{"city":"Barcelona"}' },
              },
            ],
          },
        ]),
      ),
      str("llm.request.functions", JSON.stringify(TOOL_DEFS)),
    ],
    status: { code: 1 },
  }
}

function buildGetWeatherTool(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.getWeather,
    parentSpanId: SPAN_IDS.llmCall1,
    name: "get_weather",
    kind: 1,
    startTimeUnixNano: "1710590401600000000",
    endTimeUnixNano: "1710590402000000000",
    attributes: [
      str("llm.request.type", "tool"),
      str("traceloop.entity.name", "get_weather"),
      str("traceloop.entity.input", '{"city":"Barcelona"}'),
      str("traceloop.entity.output", '{"temp":22,"condition":"sunny"}'),
    ],
    status: { code: 1 },
  }
}

function buildLlmCall2(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.llmCall2,
    parentSpanId: SPAN_IDS.agent,
    name: "chat gpt-4o",
    kind: 3,
    startTimeUnixNano: "1710590402100000000",
    endTimeUnixNano: "1710590403500000000",
    attributes: [
      str("llm.request.type", "completion"),
      str("gen_ai.system", PROVIDER),
      str("gen_ai.request.model", MODEL),
      str("gen_ai.response.model", RESPONSE_MODEL),
      str("gen_ai.response.id", "chatcmpl-abc002"),
      strArray("gen_ai.response.finish_reasons", ["tool_calls"]),
      str("gen_ai.conversation.id", SESSION_ID),
      int("gen_ai.usage.prompt_tokens", 1200),
      int("gen_ai.usage.completion_tokens", 120),
      str(
        "gen_ai.prompt",
        JSON.stringify([{ role: "tool", content: '{"temp":22,"condition":"sunny"}', tool_call_id: "call_weather_1" }]),
      ),
      str(
        "gen_ai.completion",
        JSON.stringify([
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_hotel_1",
                type: "function",
                function: { name: "book_hotel", arguments: '{"city":"Barcelona","checkin":"2026-04-01"}' },
              },
              {
                id: "call_attractions_1",
                type: "function",
                function: { name: "search_attractions", arguments: '{"city":"Barcelona"}' },
              },
            ],
          },
        ]),
      ),
    ],
    status: { code: 1 },
  }
}

function buildBookHotelTool(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.bookHotel,
    parentSpanId: SPAN_IDS.llmCall2,
    name: "book_hotel",
    kind: 1,
    startTimeUnixNano: "1710590403600000000",
    endTimeUnixNano: "1710590404000000000",
    attributes: [str("llm.request.type", "tool"), str("error.type", "BookingUnavailableError")],
    status: { code: 2, message: "No rooms available for the requested dates" },
  }
}

function buildSearchAttractionsTool(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.searchAttractions,
    parentSpanId: SPAN_IDS.llmCall2,
    name: "search_attractions",
    kind: 1,
    startTimeUnixNano: "1710590403600000000",
    endTimeUnixNano: "1710590404200000000",
    attributes: [str("llm.request.type", "tool")],
    status: { code: 1 },
  }
}

const ALIAS_PROVIDER = "bedrock"
const ALIAS_MODEL = "anthropic.claude-3-5-sonnet-20241022-v2:0"

function buildLlmCall3(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.llmCall3,
    parentSpanId: SPAN_IDS.agent,
    name: "chat anthropic.claude-3-5-sonnet",
    kind: 3,
    startTimeUnixNano: "1710590404300000000",
    endTimeUnixNano: "1710590406000000000",
    attributes: [
      str("llm.request.type", "completion"),
      str("gen_ai.system", ALIAS_PROVIDER),
      str("gen_ai.request.model", ALIAS_MODEL),
      str("gen_ai.response.model", ALIAS_MODEL),
      str("gen_ai.response.id", "chatcmpl-abc003"),
      strArray("gen_ai.response.finish_reasons", ["stop"]),
      str("gen_ai.conversation.id", SESSION_ID),
      int("gen_ai.usage.prompt_tokens", 1500),
      int("gen_ai.usage.completion_tokens", 300),
      str(
        "gen_ai.prompt",
        JSON.stringify([
          { role: "tool", content: "BookingUnavailableError: No rooms available", tool_call_id: "call_hotel_1" },
          {
            role: "tool",
            content: '{"attractions":["Sagrada Familia","Park Güell","La Rambla"]}',
            tool_call_id: "call_attractions_1",
          },
        ]),
      ),
      str("gen_ai.completion", JSON.stringify([{ role: "assistant", content: FINAL_RESPONSE }])),
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
            spans: [
              buildAgentSpan(),
              buildLlmCall1(),
              buildGetWeatherTool(),
              buildLlmCall2(),
              buildBookHotelTool(),
              buildSearchAttractionsTool(),
              buildLlmCall3(),
            ],
          },
        ],
      },
    ],
  }
}

// ─── Tests ────────────────────────────────────────────────

describe("TravelPlanner trace — GenAI deprecated / OpenLLMetry", () => {
  let spans: SpanDetail[]
  const findSpan = (id: keyof typeof SPAN_IDS) => {
    const s = spans.find((s) => s.spanId === SPAN_IDS[id])
    if (!s) throw new Error(`Span ${id} not found`)
    return s
  }

  beforeAll(() => {
    spans = transformOtlpToSpans(buildTrace(), CONTEXT)
  })

  // ── Trace structure ───────────────────────────────────

  describe("trace structure", () => {
    it("produces 7 spans", () => {
      expect(spans).toHaveLength(7)
    })

    it("all spans share the same traceId", () => {
      for (const s of spans) {
        expect(s.traceId).toBe(TRACE_ID)
      }
    })

    it("agent span has no parentSpanId", () => {
      expect(findSpan("agent").parentSpanId).toBe("")
    })

    it("LLM calls are children of agent", () => {
      expect(findSpan("llmCall1").parentSpanId).toBe(SPAN_IDS.agent)
      expect(findSpan("llmCall2").parentSpanId).toBe(SPAN_IDS.agent)
      expect(findSpan("llmCall3").parentSpanId).toBe(SPAN_IDS.agent)
    })

    it("tool spans are children of the LLM call that invoked them", () => {
      expect(findSpan("getWeather").parentSpanId).toBe(SPAN_IDS.llmCall1)
      expect(findSpan("bookHotel").parentSpanId).toBe(SPAN_IDS.llmCall2)
      expect(findSpan("searchAttractions").parentSpanId).toBe(SPAN_IDS.llmCall2)
    })

    it("populates context fields from TransformContext", () => {
      const s = findSpan("agent")
      expect(s.organizationId).toBe("org_test")
      expect(s.projectId).toBe("proj_test")
      expect(s.apiKeyId).toBe("key_test")
    })

    it("populates serviceName from resource attributes", () => {
      for (const s of spans) {
        expect(s.serviceName).toBe(SERVICE_NAME)
      }
    })

    it("converts nanosecond timestamps to Date objects", () => {
      const agent = findSpan("agent")
      expect(agent.startTime).toEqual(new Date(1710590400000))
      expect(agent.endTime).toEqual(new Date(1710590410000))
      const llm1 = findSpan("llmCall1")
      expect(llm1.startTime).toEqual(new Date(1710590400500))
      expect(llm1.endTime).toEqual(new Date(1710590401500))
    })
  })

  // ── Identity and operation ────────────────────────────

  describe("identity and operation", () => {
    it("resolves provider to 'openai' for LLM calls 1 and 2", () => {
      expect(findSpan("llmCall1").provider).toBe("openai")
      expect(findSpan("llmCall2").provider).toBe("openai")
    })

    it("resolves provider alias 'bedrock' to 'amazon-bedrock' on LLM call 3", () => {
      expect(findSpan("llmCall3").provider).toBe("amazon-bedrock")
    })

    it("resolves model to 'gpt-4o' for LLM calls 1 and 2", () => {
      expect(findSpan("llmCall1").model).toBe(MODEL)
      expect(findSpan("llmCall2").model).toBe(MODEL)
    })

    it("resolves model on LLM call 3 to the aliased model", () => {
      expect(findSpan("llmCall3").model).toBe(ALIAS_MODEL)
    })

    it("resolves responseModel for LLM spans", () => {
      expect(findSpan("llmCall1").responseModel).toBe(RESPONSE_MODEL)
      expect(findSpan("llmCall3").responseModel).toBe(ALIAS_MODEL)
    })

    it("resolves operation to 'text_completion' for LLM spans", () => {
      expect(findSpan("llmCall1").operation).toBe("text_completion")
      expect(findSpan("llmCall2").operation).toBe("text_completion")
      expect(findSpan("llmCall3").operation).toBe("text_completion")
    })

    it("resolves operation to 'invoke_agent' for agent span", () => {
      expect(findSpan("agent").operation).toBe("invoke_agent")
    })

    it("resolves operation to 'execute_tool' for tool spans", () => {
      expect(findSpan("getWeather").operation).toBe("execute_tool")
      expect(findSpan("bookHotel").operation).toBe("execute_tool")
    })

    it("agent span has no model or provider", () => {
      expect(findSpan("agent").provider).toBe("")
      expect(findSpan("agent").model).toBe("")
    })
  })

  // ── Session, user, tags, metadata, and response ──────

  describe("session, user, tags, metadata, and response", () => {
    it("resolves sessionId on LLM spans", () => {
      expect(findSpan("llmCall1").sessionId).toBe(SESSION_ID)
      expect(findSpan("llmCall2").sessionId).toBe(SESSION_ID)
    })

    it("resolves userId via traceloop.association.properties.user_id", () => {
      expect(findSpan("agent").userId).toBe(USER_ID)
    })

    it("userId is empty on spans without user attributes", () => {
      expect(findSpan("getWeather").userId).toBe("")
    })

    it("tags default to empty when no tag attributes are present", () => {
      expect(findSpan("agent").tags).toEqual([])
    })

    it("resolves metadata from traceloop.association.properties.* (dot-flattened)", () => {
      const m = findSpan("agent").metadata
      expect(m.env).toBe("staging")
      expect(m.version).toBe("2.1")
      expect(m.user_id).toBe(USER_ID)
    })

    it("metadata is empty on spans without metadata-producing attributes", () => {
      expect(findSpan("getWeather").metadata).toEqual({})
    })

    it("resolves responseId on LLM spans", () => {
      expect(findSpan("llmCall1").responseId).toBe("chatcmpl-abc001")
      expect(findSpan("llmCall2").responseId).toBe("chatcmpl-abc002")
      expect(findSpan("llmCall3").responseId).toBe("chatcmpl-abc003")
    })

    it("resolves finishReasons to ['tool_calls'] on LLM calls 1 and 2", () => {
      expect(findSpan("llmCall1").finishReasons).toEqual(["tool_calls"])
      expect(findSpan("llmCall2").finishReasons).toEqual(["tool_calls"])
    })

    it("resolves finishReasons to ['stop'] on LLM call 3", () => {
      expect(findSpan("llmCall3").finishReasons).toEqual(["stop"])
    })
  })

  // ── Token usage ───────────────────────────────────────

  describe("token usage", () => {
    it("LLM call 1: input=800, output=50, cacheRead=600", () => {
      const s = findSpan("llmCall1")
      // OpenLLMetry passthrough on OpenAI: inclusive input → non-cached + cache rows.
      expect(s.tokensInput).toBe(200)
      expect(s.tokensOutput).toBe(50)
      expect(s.tokensCacheRead).toBe(600)
      expect(s.tokensInput + s.tokensCacheRead).toBe(800)
    })

    it("LLM call 2: input=1200, output=120", () => {
      const s = findSpan("llmCall2")
      expect(s.tokensInput).toBe(1200)
      expect(s.tokensOutput).toBe(120)
    })

    it("LLM call 3: input=1500, output=300", () => {
      const s = findSpan("llmCall3")
      expect(s.tokensInput).toBe(1500)
      expect(s.tokensOutput).toBe(300)
    })

    it("agent span has zero tokens", () => {
      expect(findSpan("agent").tokensInput).toBe(0)
      expect(findSpan("agent").tokensOutput).toBe(0)
    })
  })

  // ── Cost (deprecated has no cost attributes → all estimated) ──

  describe("cost estimation", () => {
    it("LLM calls 1 and 2 have costIsEstimated true (known model)", () => {
      expect(findSpan("llmCall1").costIsEstimated).toBe(true)
      expect(findSpan("llmCall2").costIsEstimated).toBe(true)
    })

    it("costTotalMicrocents equals costInput + costOutput on LLM calls 1 and 2", () => {
      for (const id of ["llmCall1", "llmCall2"] as const) {
        const s = findSpan(id)
        expect(s.costTotalMicrocents).toBe(s.costInputMicrocents + s.costOutputMicrocents)
      }
    })

    it("LLM call 3 (bedrock alias) still computes costTotal = costInput + costOutput", () => {
      const s = findSpan("llmCall3")
      expect(s.costTotalMicrocents).toBe(s.costInputMicrocents + s.costOutputMicrocents)
    })

    it("agent and tool spans have zero cost", () => {
      expect(findSpan("agent").costTotalMicrocents).toBe(0)
      expect(findSpan("getWeather").costTotalMicrocents).toBe(0)
    })
  })

  // ── Error handling ────────────────────────────────────

  describe("error handling", () => {
    it("book_hotel span has statusCode 'error'", () => {
      expect(findSpan("bookHotel").statusCode).toBe("error")
    })

    it("book_hotel span has errorType 'BookingUnavailableError'", () => {
      expect(findSpan("bookHotel").errorType).toBe("BookingUnavailableError")
    })

    it("book_hotel span has statusMessage", () => {
      expect(findSpan("bookHotel").statusMessage).toBe("No rooms available for the requested dates")
    })

    it("other spans have statusCode 'ok'", () => {
      expect(findSpan("agent").statusCode).toBe("ok")
      expect(findSpan("llmCall1").statusCode).toBe("ok")
    })
  })

  // ── Messages — LLM call 1 (text-only input, tool call output) ──
  // Deprecated format uses { role, content } strings — no multimodal support

  describe("messages — LLM call 1 (text input, tool call output)", () => {
    it("extracts system instructions from the system message", () => {
      const s = findSpan("llmCall1")
      expect(s.systemInstructions.length).toBeGreaterThan(0)
      const systemText = s.systemInstructions.find((p) => (p.content as string).includes("travel planning"))
      expect(systemText).toBeDefined()
    })

    it("has a user input message", () => {
      const s = findSpan("llmCall1")
      const userMsg = s.inputMessages.find((m) => m.role === "user")
      expect(userMsg).toBeDefined()
    })

    it("output has an assistant message with text + tool_call parts", () => {
      const s = findSpan("llmCall1")
      const assistant = s.outputMessages.find((m) => m.role === "assistant")
      expect(assistant).toBeDefined()
      const parts = (assistant as { parts: { type: string; name?: string; content?: string }[] }).parts
      const textPart = parts.find((p) => p.type === "text")
      expect(textPart).toBeDefined()
      expect((textPart as { content: string }).content).toContain("check the weather")
      const toolCall = parts.find((p) => p.type === "tool_call")
      expect(toolCall).toBeDefined()
      expect((toolCall as { name: string }).name).toBe("get_weather")
    })
  })

  // ── Messages — LLM call 2 ────────────────────────────

  describe("messages — LLM call 2 (tool result input, multi-tool output)", () => {
    it("input includes a tool result message", () => {
      const s = findSpan("llmCall2")
      const toolMsg = s.inputMessages.find((m) => m.role === "tool")
      expect(toolMsg).toBeDefined()
    })

    it("output has an assistant message with two tool_call parts", () => {
      const s = findSpan("llmCall2")
      const assistant = s.outputMessages.find((m) => m.role === "assistant")
      const parts = (assistant as { parts: { type: string; name?: string }[] }).parts
      const toolCalls = parts.filter((p) => p.type === "tool_call")
      expect(toolCalls).toHaveLength(2)
      const names = toolCalls.map((tc) => (tc as { name: string }).name)
      expect(names).toContain("book_hotel")
      expect(names).toContain("search_attractions")
    })
  })

  // ── Messages — LLM call 3 ────────────────────────────

  describe("messages — LLM call 3 (final text response)", () => {
    it("input includes tool result messages", () => {
      const s = findSpan("llmCall3")
      const toolMsgs = s.inputMessages.filter((m) => m.role === "tool")
      expect(toolMsgs.length).toBeGreaterThanOrEqual(2)
    })

    it("output has an assistant message with a text part", () => {
      const s = findSpan("llmCall3")
      const assistant = s.outputMessages.find((m) => m.role === "assistant")
      const parts = (assistant as { parts: { type: string; content?: string }[] }).parts
      const textPart = parts.find((p) => p.type === "text")
      expect(textPart).toBeDefined()
      expect((textPart as { content: string }).content).toContain("weather")
    })
  })

  // ── Tool definitions ──────────────────────────────────

  describe("tool definitions (via llm.request.functions)", () => {
    it("LLM call 1 has 3 tool definitions", () => {
      expect(findSpan("llmCall1").toolDefinitions).toHaveLength(3)
    })

    it("tool definitions include all three tools", () => {
      const names = findSpan("llmCall1").toolDefinitions.map((t) => t.name)
      expect(names).toContain("get_weather")
      expect(names).toContain("book_hotel")
      expect(names).toContain("search_attractions")
    })

    it("agent and tool spans have no tool definitions", () => {
      expect(findSpan("agent").toolDefinitions).toHaveLength(0)
      expect(findSpan("getWeather").toolDefinitions).toHaveLength(0)
    })
  })

  // ── Tool execution — execute_tool span fields ──────

  describe("tool execution — execute_tool span fields (traceloop.entity.*)", () => {
    it("get_weather tool span has toolName from traceloop.entity.name", () => {
      expect(findSpan("getWeather").toolName).toBe("get_weather")
    })

    it("get_weather tool span has toolInput from traceloop.entity.input", () => {
      expect(findSpan("getWeather").toolInput).toBe('{"city":"Barcelona"}')
    })

    it("get_weather tool span has toolOutput from traceloop.entity.output", () => {
      expect(findSpan("getWeather").toolOutput).toBe('{"temp":22,"condition":"sunny"}')
    })

    it("non-tool spans have empty tool execution fields", () => {
      expect(findSpan("llmCall1").toolCallId).toBe("")
      expect(findSpan("llmCall1").toolName).toBe("")
      expect(findSpan("llmCall1").toolInput).toBe("")
      expect(findSpan("agent").toolCallId).toBe("")
    })

    it("tool spans without tool-call attributes have empty fields", () => {
      expect(findSpan("bookHotel").toolCallId).toBe("")
      expect(findSpan("bookHotel").toolName).toBe("")
      expect(findSpan("bookHotel").toolInput).toBe("")
      expect(findSpan("searchAttractions").toolName).toBe("")
      expect(findSpan("searchAttractions").toolOutput).toBe("")
    })
  })

  // ── Performance defaults ───────────────────────────

  describe("performance defaults", () => {
    it("all spans have zero TTFT and isStreaming false (no perf attributes)", () => {
      expect(findSpan("llmCall1").timeToFirstTokenNs).toBe(0)
      expect(findSpan("llmCall1").isStreaming).toBe(false)
      expect(findSpan("agent").timeToFirstTokenNs).toBe(0)
      expect(findSpan("getWeather").isStreaming).toBe(false)
    })
  })
})

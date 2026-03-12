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
function float(key: string, value: number): OtlpKeyValue {
  return { key, value: { doubleValue: value } }
}

// ─── Trace constants ──────────────────────────────────────
const TRACE_ID = "0af7651916cd43dd8448eb211c80319c"
const SESSION_ID = "session-travel-123"
const SERVICE_NAME = "travel-planner"
const SCOPE_NAME = "openinference-instrumentor"
const SCOPE_VERSION = "2.0.0"

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
const PROVIDER = "openai"

const SYSTEM_PROMPT =
  "You are a travel planning assistant. Help users plan trips by checking weather, booking hotels, and finding attractions."
const USER_TEXT = "Plan a trip to Barcelona. Here is a photo of the area I want to stay in:"
const IMAGE_URL = "https://example.com/destination.jpg"
const FINAL_RESPONSE =
  "Based on the weather (22°C, sunny), I found several attractions. Unfortunately the hotel booking failed, but here are your options..."

const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather for a city",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    },
  },
  {
    type: "function",
    function: {
      name: "book_hotel",
      description: "Book a hotel in a city",
      parameters: {
        type: "object",
        properties: { city: { type: "string" }, checkin: { type: "string" } },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_attractions",
      description: "Search tourist attractions",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    },
  },
]

const CONTEXT: TransformContext = {
  organizationId: "org_test",
  projectId: "proj_test",
  apiKeyId: "key_test",
  ingestedAt: new Date("2026-03-16T12:00:00Z"),
}

// ─── Explicit cost values for LLM call 1 ─────────────────
// OpenInference has llm.cost.prompt / llm.cost.completion
const EXPLICIT_COST_INPUT_USD = 0.002
const EXPLICIT_COST_OUTPUT_USD = 0.0005
const MICROCENTS_PER_USD = 100_000_000

// ─── Span builders (OpenInference convention) ─────────────

function buildAgentSpan(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.agent,
    name: "TravelPlanner",
    kind: 1,
    startTimeUnixNano: "1710590400000000000",
    endTimeUnixNano: "1710590410000000000",
    attributes: [str("openinference.span.kind", "AGENT")],
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
      str("openinference.span.kind", "LLM"),
      str("llm.system", PROVIDER),
      str("llm.model_name", MODEL),
      str("session.id", SESSION_ID),
      int("llm.token_count.prompt", 800),
      int("llm.token_count.completion", 50),
      int("llm.token_count.prompt_details.cache_read", 600),
      float("llm.cost.prompt", EXPLICIT_COST_INPUT_USD),
      float("llm.cost.completion", EXPLICIT_COST_OUTPUT_USD),
      // System message
      str("llm.input_messages.0.message.role", "system"),
      str("llm.input_messages.0.message.content", SYSTEM_PROMPT),
      // Multimodal user message via contents.*
      str("llm.input_messages.1.message.role", "user"),
      str("llm.input_messages.1.message.contents.0.message_content.type", "text"),
      str("llm.input_messages.1.message.contents.0.message_content.text", USER_TEXT),
      str("llm.input_messages.1.message.contents.1.message_content.type", "image"),
      str("llm.input_messages.1.message.contents.1.message_content.image.image.url", IMAGE_URL),
      // Output: assistant with text + tool_call
      str("llm.output_messages.0.message.role", "assistant"),
      str("llm.output_messages.0.message.content", "Let me check the weather for you."),
      str("llm.output_messages.0.message.tool_calls.0.tool_call.function.name", "get_weather"),
      str("llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments", '{"city":"Barcelona"}'),
      // Tool definitions
      str("llm.tools.0.tool.json_schema", JSON.stringify(TOOL_DEFS[0])),
      str("llm.tools.1.tool.json_schema", JSON.stringify(TOOL_DEFS[1])),
      str("llm.tools.2.tool.json_schema", JSON.stringify(TOOL_DEFS[2])),
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
    attributes: [str("openinference.span.kind", "TOOL")],
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
      str("openinference.span.kind", "LLM"),
      str("llm.system", PROVIDER),
      str("llm.model_name", MODEL),
      str("session.id", SESSION_ID),
      int("llm.token_count.prompt", 1200),
      int("llm.token_count.completion", 120),
      int("llm.token_count.completion_details.reasoning", 40),
      // Input: tool result from get_weather
      str("llm.input_messages.0.message.role", "tool"),
      str("llm.input_messages.0.message.content", '{"temp":22,"condition":"sunny"}'),
      // Output: assistant with two tool_calls
      str("llm.output_messages.0.message.role", "assistant"),
      str("llm.output_messages.0.message.tool_calls.0.tool_call.function.name", "book_hotel"),
      str(
        "llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments",
        '{"city":"Barcelona","checkin":"2026-04-01"}',
      ),
      str("llm.output_messages.0.message.tool_calls.1.tool_call.function.name", "search_attractions"),
      str("llm.output_messages.0.message.tool_calls.1.tool_call.function.arguments", '{"city":"Barcelona"}'),
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
    attributes: [str("openinference.span.kind", "TOOL"), str("error.type", "BookingUnavailableError")],
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
    attributes: [str("openinference.span.kind", "TOOL")],
    status: { code: 1 },
  }
}

function buildLlmCall3(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.llmCall3,
    parentSpanId: SPAN_IDS.agent,
    name: "chat gpt-4o",
    kind: 3,
    startTimeUnixNano: "1710590404300000000",
    endTimeUnixNano: "1710590406000000000",
    attributes: [
      str("openinference.span.kind", "LLM"),
      str("llm.system", PROVIDER),
      str("llm.model_name", MODEL),
      str("session.id", SESSION_ID),
      int("llm.token_count.prompt", 1500),
      int("llm.token_count.completion", 300),
      // Input: tool results (including failed one)
      str("llm.input_messages.0.message.role", "tool"),
      str("llm.input_messages.0.message.content", "BookingUnavailableError: No rooms available"),
      str("llm.input_messages.1.message.role", "tool"),
      str("llm.input_messages.1.message.content", '{"attractions":["Sagrada Familia","Park Güell","La Rambla"]}'),
      // Output: text response
      str("llm.output_messages.0.message.role", "assistant"),
      str("llm.output_messages.0.message.content", FINAL_RESPONSE),
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

describe("TravelPlanner trace — OpenInference (Arize Phoenix)", () => {
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
    it("resolves provider to 'openai' for LLM spans", () => {
      expect(findSpan("llmCall1").provider).toBe("openai")
      expect(findSpan("llmCall2").provider).toBe("openai")
      expect(findSpan("llmCall3").provider).toBe("openai")
    })

    it("resolves model to 'gpt-4o' for LLM spans", () => {
      expect(findSpan("llmCall1").model).toBe(MODEL)
      expect(findSpan("llmCall2").model).toBe(MODEL)
    })

    it("resolves responseModel (shared llm.model_name key)", () => {
      expect(findSpan("llmCall1").responseModel).toBe(MODEL)
    })

    it("resolves operation to 'chat' for LLM spans", () => {
      expect(findSpan("llmCall1").operation).toBe("chat")
      expect(findSpan("llmCall2").operation).toBe("chat")
      expect(findSpan("llmCall3").operation).toBe("chat")
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

  // ── Session ───────────────────────────────────────────

  describe("session metadata", () => {
    it("resolves sessionId on LLM spans", () => {
      expect(findSpan("llmCall1").sessionId).toBe(SESSION_ID)
      expect(findSpan("llmCall2").sessionId).toBe(SESSION_ID)
      expect(findSpan("llmCall3").sessionId).toBe(SESSION_ID)
    })
  })

  // ── Token usage ───────────────────────────────────────

  describe("token usage", () => {
    it("LLM call 1: input=800, output=50, cacheRead=600", () => {
      const s = findSpan("llmCall1")
      expect(s.tokensInput).toBe(800)
      expect(s.tokensOutput).toBe(50)
      expect(s.tokensCacheRead).toBe(600)
    })

    it("LLM call 2: input=1200, output=120, reasoning=40", () => {
      const s = findSpan("llmCall2")
      expect(s.tokensInput).toBe(1200)
      expect(s.tokensOutput).toBe(120)
      expect(s.tokensReasoning).toBe(40)
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

  // ── Cost (OpenInference has explicit cost attributes) ──

  describe("cost — explicit extraction on LLM call 1", () => {
    it("LLM call 1 has costIsEstimated false (explicit llm.cost.* attributes)", () => {
      expect(findSpan("llmCall1").costIsEstimated).toBe(false)
    })

    it("LLM call 1 explicit cost values match", () => {
      const s = findSpan("llmCall1")
      expect(s.costInputMicrocents).toBe(Math.round(EXPLICIT_COST_INPUT_USD * MICROCENTS_PER_USD))
      expect(s.costOutputMicrocents).toBe(Math.round(EXPLICIT_COST_OUTPUT_USD * MICROCENTS_PER_USD))
    })

    it("LLM call 1 costTotalMicrocents equals costInput + costOutput", () => {
      const s = findSpan("llmCall1")
      expect(s.costTotalMicrocents).toBe(s.costInputMicrocents + s.costOutputMicrocents)
    })
  })

  describe("cost — estimation on LLM calls 2 and 3 (no cost attributes)", () => {
    it("LLM calls 2 and 3 have costIsEstimated true", () => {
      expect(findSpan("llmCall2").costIsEstimated).toBe(true)
      expect(findSpan("llmCall3").costIsEstimated).toBe(true)
    })

    it("costTotalMicrocents equals costInput + costOutput", () => {
      for (const id of ["llmCall2", "llmCall3"] as const) {
        const s = findSpan(id)
        expect(s.costTotalMicrocents).toBe(s.costInputMicrocents + s.costOutputMicrocents)
      }
    })
  })

  describe("cost — agent and tool spans have zero cost", () => {
    it("agent and tool spans have zero cost", () => {
      expect(findSpan("agent").costTotalMicrocents).toBe(0)
      expect(findSpan("getWeather").costTotalMicrocents).toBe(0)
      expect(findSpan("bookHotel").costTotalMicrocents).toBe(0)
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

  // ── Messages — LLM call 1 (multimodal input, tool call output) ──

  describe("messages — LLM call 1 (multimodal input, tool call output)", () => {
    it("extracts system instructions from the system message", () => {
      const s = findSpan("llmCall1")
      expect(s.systemInstructions).toBeTruthy()
      const parsed = JSON.parse(s.systemInstructions)
      const systemText = parsed.find((p: { content: string }) => p.content?.includes("travel planning"))
      expect(systemText).toBeDefined()
    })

    it("has a user input message with multimodal content", () => {
      const s = findSpan("llmCall1")
      const userMsg = s.inputMessages.find((m) => m.role === "user")
      expect(userMsg).toBeDefined()
      const parts = (userMsg as { parts: { type: string }[] }).parts
      expect(parts.some((p) => p.type === "text")).toBe(true)
      expect(parts.some((p) => p.type === "uri")).toBe(true)
    })

    it("multimodal image part contains the correct URL", () => {
      const userMsg = findSpan("llmCall1").inputMessages.find((m) => m.role === "user")
      const parts = (userMsg as { parts: { type: string; uri?: string }[] }).parts
      const imagePart = parts.find((p) => p.type === "uri")
      expect((imagePart as { uri: string }).uri).toBe(IMAGE_URL)
    })

    it("output has an assistant message with text + tool_call parts", () => {
      const s = findSpan("llmCall1")
      const assistant = s.outputMessages.find((m) => m.role === "assistant")
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

  describe("tool definitions (via llm.tools.*.tool.json_schema)", () => {
    it("LLM call 1 has 3 tool definitions", () => {
      const s = findSpan("llmCall1")
      expect(s.toolDefinitions).toBeTruthy()
      const parsed = JSON.parse(s.toolDefinitions)
      expect(parsed).toHaveLength(3)
    })

    it("tool definitions include all three tools", () => {
      const parsed = JSON.parse(findSpan("llmCall1").toolDefinitions)
      const names = parsed.map((t: { function: { name: string } }) => t.function.name)
      expect(names).toContain("get_weather")
      expect(names).toContain("book_hotel")
      expect(names).toContain("search_attractions")
    })

    it("agent and tool spans have no tool definitions", () => {
      expect(findSpan("agent").toolDefinitions).toBe("")
      expect(findSpan("getWeather").toolDefinitions).toBe("")
    })
  })
})

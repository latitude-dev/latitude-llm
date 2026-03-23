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
function strArrayValue(key: string, values: string[]): OtlpKeyValue {
  return { key, value: { arrayValue: { values: values.map((v) => ({ stringValue: v })) } } }
}

// ─── Trace constants ──────────────────────────────────────
const TRACE_ID = "0af7651916cd43dd8448eb211c80319c"
const SERVICE_NAME = "travel-planner"
const SCOPE_NAME = "ai"
const SCOPE_VERSION = "4.0.0"
const SESSION_ID = "thread-vercel-789"
const METADATA_OBJ = { region: "eu-west", tier: "premium" }

const SPAN_IDS = {
  agent: "b7ad6b7169203331",
  llm1Outer: "a1b2c3d4e5f60001",
  llm1Inner: "a1b2c3d4e5f60002",
  getWeather: "a1b2c3d4e5f60003",
  llm2Outer: "a1b2c3d4e5f60004",
  llm2Inner: "a1b2c3d4e5f60005",
  bookHotel: "a1b2c3d4e5f60006",
  searchAttractions: "a1b2c3d4e5f60007",
  llm3Outer: "a1b2c3d4e5f60008",
  llm3Inner: "a1b2c3d4e5f60009",
} as const

const MODEL = "gpt-4o"
const RESPONSE_MODEL = "gpt-4o-2024-05-13"

const SYSTEM_PROMPT =
  "You are a travel planning assistant. Help users plan trips by checking weather, booking hotels, and finding attractions."
const USER_TEXT = "Plan a trip to Barcelona. Here is a photo of the area I want to stay in:"
const IMAGE_URL = "https://example.com/destination.jpg"
const FINAL_RESPONSE =
  "Based on the weather (22°C, sunny), I found several attractions. Unfortunately the hotel booking failed, but here are your options..."

const TOOL_DEFS = [
  {
    type: "function",
    name: "get_weather",
    description: "Get current weather for a city",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
  },
  {
    type: "function",
    name: "book_hotel",
    description: "Book a hotel in a city",
    parameters: {
      type: "object",
      properties: { city: { type: "string" }, checkin: { type: "string" } },
      required: ["city"],
    },
  },
  {
    type: "function",
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

// ─── Span builders (Vercel AI SDK convention) ─────────────
// Each LLM generation produces two spans:
//   outer (ai.generateText): has ai.prompt, ai.response.text, ai.response.toolCalls
//   inner (ai.generateText.doGenerate): has ai.prompt.messages, ai.prompt.tools, usage, model

function buildAgentSpan(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.agent,
    name: "TravelPlanner",
    kind: 1,
    startTimeUnixNano: "1710590400000000000",
    endTimeUnixNano: "1710590410000000000",
    attributes: [
      str("session.id", SESSION_ID),
      str("user.id", "vercel-user-1"),
      str("metadata", JSON.stringify(METADATA_OBJ)),
    ],
    status: { code: 1 },
  }
}

// ── LLM call 1: multimodal input → get_weather tool call ──

function buildLlm1Outer(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.llm1Outer,
    parentSpanId: SPAN_IDS.agent,
    name: "ai.generateText",
    kind: 1,
    startTimeUnixNano: "1710590400500000000",
    endTimeUnixNano: "1710590401500000000",
    attributes: [
      str("ai.operationId", "ai.generateText"),
      str(
        "ai.prompt",
        JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: USER_TEXT },
                { type: "image", image: IMAGE_URL },
              ],
            },
          ],
        }),
      ),
      str("ai.response.text", "Let me check the weather for you."),
      str(
        "ai.response.toolCalls",
        JSON.stringify([{ toolCallId: "call_weather_1", toolName: "get_weather", input: { city: "Barcelona" } }]),
      ),
      str("ai.response.id", "chatcmpl-abc001"),
      str("ai.response.finishReason", "tool-calls"),
    ],
    status: { code: 1 },
  }
}

function buildLlm1Inner(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.llm1Inner,
    parentSpanId: SPAN_IDS.llm1Outer,
    name: "ai.generateText.doGenerate",
    kind: 1,
    startTimeUnixNano: "1710590400600000000",
    endTimeUnixNano: "1710590401400000000",
    attributes: [
      str("ai.operationId", "ai.generateText.doGenerate"),
      str("ai.model.provider", "openai.chat"),
      str("ai.model.id", MODEL),
      str("ai.response.model", RESPONSE_MODEL),
      int("ai.usage.promptTokens", 800),
      int("ai.usage.completionTokens", 50),
      str(
        "ai.prompt.messages",
        JSON.stringify([
          {
            role: "user",
            content: [
              { type: "text", text: USER_TEXT },
              { type: "image", image: IMAGE_URL },
            ],
          },
        ]),
      ),
      strArrayValue(
        "ai.prompt.tools",
        TOOL_DEFS.map((t) => JSON.stringify(t)),
      ),
    ],
    status: { code: 1 },
  }
}

function buildGetWeatherTool(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.getWeather,
    parentSpanId: SPAN_IDS.llm1Outer,
    name: "ai.toolCall get_weather",
    kind: 1,
    startTimeUnixNano: "1710590401600000000",
    endTimeUnixNano: "1710590402000000000",
    attributes: [str("ai.operationId", "ai.toolCall")],
    status: { code: 1 },
  }
}

// ── LLM call 2 (streamText variant): tool result → book_hotel + search_attractions ──

function buildLlm2Outer(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.llm2Outer,
    parentSpanId: SPAN_IDS.agent,
    name: "ai.streamText",
    kind: 1,
    startTimeUnixNano: "1710590402100000000",
    endTimeUnixNano: "1710590403500000000",
    attributes: [
      str("ai.operationId", "ai.streamText"),
      str(
        "ai.prompt",
        JSON.stringify({
          messages: [
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: "call_weather_1",
                  toolName: "get_weather",
                  result: { temp: 22, condition: "sunny" },
                },
              ],
            },
          ],
        }),
      ),
      str(
        "ai.response.toolCalls",
        JSON.stringify([
          { toolCallId: "call_hotel_1", toolName: "book_hotel", input: { city: "Barcelona", checkin: "2026-04-01" } },
          { toolCallId: "call_attractions_1", toolName: "search_attractions", input: { city: "Barcelona" } },
        ]),
      ),
      str("ai.response.id", "chatcmpl-abc002"),
      str("ai.response.finishReason", "tool-calls"),
    ],
    status: { code: 1 },
  }
}

const LLM2_INNER_SYSTEM = "You are a travel assistant continuing a multi-step plan."

function buildLlm2Inner(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.llm2Inner,
    parentSpanId: SPAN_IDS.llm2Outer,
    name: "ai.streamText.doStream",
    kind: 1,
    startTimeUnixNano: "1710590402200000000",
    endTimeUnixNano: "1710590403400000000",
    attributes: [
      str("ai.operationId", "ai.streamText.doStream"),
      str("ai.model.provider", "openai.chat"),
      str("ai.model.id", MODEL),
      str("ai.response.model", RESPONSE_MODEL),
      int("ai.usage.promptTokens", 1200),
      int("ai.usage.completionTokens", 120),
      // ai.prompt (top-level) AND ai.prompt.messages (call-level) both present
      // ai.prompt should take precedence
      str(
        "ai.prompt",
        JSON.stringify({
          system: LLM2_INNER_SYSTEM,
          messages: [
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: "call_weather_1",
                  toolName: "get_weather",
                  result: { temp: 22, condition: "sunny" },
                },
              ],
            },
          ],
        }),
      ),
      str(
        "ai.prompt.messages",
        JSON.stringify([
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "call_weather_1",
                toolName: "get_weather",
                result: { temp: 22, condition: "sunny" },
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
    parentSpanId: SPAN_IDS.llm2Outer,
    name: "ai.toolCall book_hotel",
    kind: 1,
    startTimeUnixNano: "1710590403600000000",
    endTimeUnixNano: "1710590404000000000",
    attributes: [str("ai.operationId", "ai.toolCall"), str("error.type", "BookingUnavailableError")],
    status: { code: 2, message: "No rooms available for the requested dates" },
  }
}

function buildSearchAttractionsTool(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.searchAttractions,
    parentSpanId: SPAN_IDS.llm2Outer,
    name: "ai.toolCall search_attractions",
    kind: 1,
    startTimeUnixNano: "1710590403600000000",
    endTimeUnixNano: "1710590404200000000",
    attributes: [str("ai.operationId", "ai.toolCall")],
    status: { code: 1 },
  }
}

// ── LLM call 3: tool results (including error) → final text ──

function buildLlm3Outer(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.llm3Outer,
    parentSpanId: SPAN_IDS.agent,
    name: "ai.generateText",
    kind: 1,
    startTimeUnixNano: "1710590404300000000",
    endTimeUnixNano: "1710590406000000000",
    attributes: [
      str("ai.operationId", "ai.generateText"),
      str(
        "ai.prompt",
        JSON.stringify({
          messages: [
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: "call_hotel_1",
                  toolName: "book_hotel",
                  isError: true,
                  result: "BookingUnavailableError: No rooms available",
                },
              ],
            },
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: "call_attractions_1",
                  toolName: "search_attractions",
                  result: { attractions: ["Sagrada Familia", "Park Güell", "La Rambla"] },
                },
              ],
            },
          ],
        }),
      ),
      str("ai.response.text", FINAL_RESPONSE),
      str("ai.response.id", "chatcmpl-abc003"),
      str("ai.response.finishReason", "stop"),
    ],
    status: { code: 1 },
  }
}

function buildLlm3Inner(): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId: SPAN_IDS.llm3Inner,
    parentSpanId: SPAN_IDS.llm3Outer,
    name: "ai.generateText.doGenerate",
    kind: 1,
    startTimeUnixNano: "1710590404400000000",
    endTimeUnixNano: "1710590405900000000",
    attributes: [
      str("ai.operationId", "ai.generateText.doGenerate"),
      str("ai.model.provider", "openai.chat"),
      str("ai.model.id", MODEL),
      str("ai.response.model", RESPONSE_MODEL),
      int("ai.usage.promptTokens", 1500),
      int("ai.usage.completionTokens", 300),
      str(
        "ai.prompt.messages",
        JSON.stringify([
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "call_hotel_1",
                toolName: "book_hotel",
                isError: true,
                result: "BookingUnavailableError: No rooms available",
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "call_attractions_1",
                toolName: "search_attractions",
                result: { attractions: ["Sagrada Familia", "Park Güell", "La Rambla"] },
              },
            ],
          },
        ]),
      ),
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
              buildLlm1Outer(),
              buildLlm1Inner(),
              buildGetWeatherTool(),
              buildLlm2Outer(),
              buildLlm2Inner(),
              buildBookHotelTool(),
              buildSearchAttractionsTool(),
              buildLlm3Outer(),
              buildLlm3Inner(),
            ],
          },
        ],
      },
    ],
  }
}

// ─── Tests ────────────────────────────────────────────────

describe("TravelPlanner trace — Vercel AI SDK", () => {
  let spans: SpanDetail[]
  const findSpan = (id: keyof typeof SPAN_IDS) => {
    const s = spans.find((s) => s.spanId === SPAN_IDS[id])
    if (!s) throw new Error(`Span ${id} not found`)
    return s
  }

  beforeAll(() => {
    spans = transformOtlpToSpans(buildTrace(), CONTEXT)
  })

  // ── Trace structure (Vercel dual-span pattern) ────────

  describe("trace structure", () => {
    it("produces 10 spans (3 outer + 3 inner + 3 tools + 1 agent)", () => {
      expect(spans).toHaveLength(10)
    })

    it("all spans share the same traceId", () => {
      for (const s of spans) {
        expect(s.traceId).toBe(TRACE_ID)
      }
    })

    it("agent span has no parentSpanId", () => {
      expect(findSpan("agent").parentSpanId).toBe("")
    })

    it("outer LLM spans are children of agent", () => {
      expect(findSpan("llm1Outer").parentSpanId).toBe(SPAN_IDS.agent)
      expect(findSpan("llm2Outer").parentSpanId).toBe(SPAN_IDS.agent)
      expect(findSpan("llm3Outer").parentSpanId).toBe(SPAN_IDS.agent)
    })

    it("inner (doGenerate) spans are children of their outer span", () => {
      expect(findSpan("llm1Inner").parentSpanId).toBe(SPAN_IDS.llm1Outer)
      expect(findSpan("llm2Inner").parentSpanId).toBe(SPAN_IDS.llm2Outer)
      expect(findSpan("llm3Inner").parentSpanId).toBe(SPAN_IDS.llm3Outer)
    })

    it("tool spans are children of their outer LLM span", () => {
      expect(findSpan("getWeather").parentSpanId).toBe(SPAN_IDS.llm1Outer)
      expect(findSpan("bookHotel").parentSpanId).toBe(SPAN_IDS.llm2Outer)
      expect(findSpan("searchAttractions").parentSpanId).toBe(SPAN_IDS.llm2Outer)
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
      const llm1Outer = findSpan("llm1Outer")
      expect(llm1Outer.startTime).toEqual(new Date(1710590400500))
      expect(llm1Outer.endTime).toEqual(new Date(1710590401500))
    })
  })

  // ── Session, user, tags, metadata ────────────────────

  describe("session, user, tags, metadata", () => {
    it("resolves sessionId via session.id (OpenInference)", () => {
      expect(findSpan("agent").sessionId).toBe(SESSION_ID)
    })

    it("resolves userId via user.id (OpenInference)", () => {
      expect(findSpan("agent").userId).toBe("vercel-user-1")
    })

    it("userId is empty on spans without user attributes", () => {
      expect(findSpan("llm1Inner").userId).toBe("")
    })

    it("tags default to empty when no tag attributes are present", () => {
      expect(findSpan("agent").tags).toEqual([])
    })

    it("resolves metadata from JSON string (OpenInference metadata)", () => {
      expect(findSpan("agent").metadata).toEqual({ region: "eu-west", tier: "premium" })
    })

    it("metadata is empty on spans without metadata attributes", () => {
      expect(findSpan("llm1Inner").metadata).toEqual({})
    })
  })

  // ── Identity and operation ────────────────────────────
  // In Vercel, model/provider live on the INNER (doGenerate/doStream) span

  describe("identity and operation", () => {
    it("resolves provider to 'openai' on inner spans (strips .chat suffix)", () => {
      expect(findSpan("llm1Inner").provider).toBe("openai")
      expect(findSpan("llm2Inner").provider).toBe("openai")
      expect(findSpan("llm3Inner").provider).toBe("openai")
    })

    it("resolves model to 'gpt-4o' on inner spans", () => {
      expect(findSpan("llm1Inner").model).toBe(MODEL)
      expect(findSpan("llm2Inner").model).toBe(MODEL)
    })

    it("resolves responseModel on inner spans", () => {
      expect(findSpan("llm1Inner").responseModel).toBe(RESPONSE_MODEL)
      expect(findSpan("llm3Inner").responseModel).toBe(RESPONSE_MODEL)
    })

    it("outer spans have no model or provider (not their concern)", () => {
      expect(findSpan("llm1Outer").provider).toBe("")
      expect(findSpan("llm1Outer").model).toBe("")
    })

    it("resolves operation to 'chat' for generateText and streamText spans alike", () => {
      expect(findSpan("llm1Outer").operation).toBe("chat")
      expect(findSpan("llm1Inner").operation).toBe("chat")
      expect(findSpan("llm2Outer").operation).toBe("chat")
      expect(findSpan("llm2Inner").operation).toBe("chat")
    })

    it("resolves operation to 'execute_tool' for tool spans", () => {
      expect(findSpan("getWeather").operation).toBe("execute_tool")
      expect(findSpan("bookHotel").operation).toBe("execute_tool")
      expect(findSpan("searchAttractions").operation).toBe("execute_tool")
    })

    it("agent span has no operation (no ai.operationId)", () => {
      expect(findSpan("agent").operation).toBe("unspecified")
    })
  })

  // ── Response metadata ─────────────────────────────────
  // Response IDs and finish reasons live on the OUTER spans

  describe("response metadata", () => {
    it("resolves responseId on outer LLM spans", () => {
      expect(findSpan("llm1Outer").responseId).toBe("chatcmpl-abc001")
      expect(findSpan("llm2Outer").responseId).toBe("chatcmpl-abc002")
      expect(findSpan("llm3Outer").responseId).toBe("chatcmpl-abc003")
    })

    it("resolves finishReasons to ['tool_calls'] on outer LLM calls 1 and 2", () => {
      expect(findSpan("llm1Outer").finishReasons).toEqual(["tool_calls"])
      expect(findSpan("llm2Outer").finishReasons).toEqual(["tool_calls"])
    })

    it("resolves finishReasons to ['stop'] on outer LLM call 3", () => {
      expect(findSpan("llm3Outer").finishReasons).toEqual(["stop"])
    })
  })

  // ── Token usage (lives on inner spans) ────────────────

  describe("token usage", () => {
    it("LLM call 1 inner: input=800, output=50", () => {
      const s = findSpan("llm1Inner")
      expect(s.tokensInput).toBe(800)
      expect(s.tokensOutput).toBe(50)
    })

    it("LLM call 2 inner: input=1200, output=120", () => {
      const s = findSpan("llm2Inner")
      expect(s.tokensInput).toBe(1200)
      expect(s.tokensOutput).toBe(120)
    })

    it("LLM call 3 inner: input=1500, output=300", () => {
      const s = findSpan("llm3Inner")
      expect(s.tokensInput).toBe(1500)
      expect(s.tokensOutput).toBe(300)
    })

    it("outer LLM spans have zero tokens (usage is on inner)", () => {
      expect(findSpan("llm1Outer").tokensInput).toBe(0)
      expect(findSpan("llm1Outer").tokensOutput).toBe(0)
    })

    it("agent span has zero tokens", () => {
      expect(findSpan("agent").tokensInput).toBe(0)
      expect(findSpan("agent").tokensOutput).toBe(0)
    })
  })

  // ── Cost (Vercel has no cost attributes → all estimated on inner) ──

  describe("cost estimation", () => {
    it("inner LLM spans have costIsEstimated true", () => {
      expect(findSpan("llm1Inner").costIsEstimated).toBe(true)
      expect(findSpan("llm2Inner").costIsEstimated).toBe(true)
      expect(findSpan("llm3Inner").costIsEstimated).toBe(true)
    })

    it("costTotalMicrocents equals costInput + costOutput on inner spans", () => {
      for (const id of ["llm1Inner", "llm2Inner", "llm3Inner"] as const) {
        const s = findSpan(id)
        expect(s.costTotalMicrocents).toBe(s.costInputMicrocents + s.costOutputMicrocents)
      }
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
      expect(findSpan("llm1Outer").statusCode).toBe("ok")
    })
  })

  // ── Messages — LLM call 1 (on outer span) ────────────

  describe("messages — LLM call 1 outer (multimodal input, tool call output)", () => {
    it("has system instructions from ai.prompt.system", () => {
      const s = findSpan("llm1Outer")
      expect(s.systemInstructions.length).toBeGreaterThan(0)
      const systemText = s.systemInstructions.find((p) => (p.content as string).includes("travel planning"))
      expect(systemText).toBeDefined()
    })

    it("has a user input message with multimodal content", () => {
      const s = findSpan("llm1Outer")
      const userMsg = s.inputMessages.find((m) => m.role === "user")
      expect(userMsg).toBeDefined()
      const parts = (userMsg as { parts: { type: string }[] }).parts
      expect(parts.some((p) => p.type === "text")).toBe(true)
      expect(parts.some((p) => p.type === "uri")).toBe(true)
    })

    it("output has an assistant message with text + tool_call parts", () => {
      const s = findSpan("llm1Outer")
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

  // ── Messages — LLM call 1 inner (call-level) ─────────

  describe("messages — LLM call 1 inner (call-level input, tool definitions)", () => {
    it("has user input messages from ai.prompt.messages", () => {
      const s = findSpan("llm1Inner")
      const userMsg = s.inputMessages.find((m) => m.role === "user")
      expect(userMsg).toBeDefined()
    })

    it("has tool definitions from ai.prompt.tools", () => {
      expect(findSpan("llm1Inner").toolDefinitions).toHaveLength(3)
    })

    it("tool definitions include all three tools", () => {
      const names = findSpan("llm1Inner").toolDefinitions.map((t) => t.name)
      expect(names).toContain("get_weather")
      expect(names).toContain("book_hotel")
      expect(names).toContain("search_attractions")
    })
  })

  // ── Messages — LLM call 2 inner (ai.prompt vs ai.prompt.messages fallback) ──

  describe("messages — LLM call 2 inner (ai.prompt preferred over ai.prompt.messages)", () => {
    it("has system instructions from ai.prompt (proves top-level preference)", () => {
      const s = findSpan("llm2Inner")
      expect(s.systemInstructions.length).toBeGreaterThan(0)
      const systemText = s.systemInstructions.find((p) => (p.content as string).includes("continuing a multi-step"))
      expect(systemText).toBeDefined()
    })

    it("still has tool input messages from ai.prompt top-level", () => {
      const s = findSpan("llm2Inner")
      const toolMsg = s.inputMessages.find((m) => m.role === "tool")
      expect(toolMsg).toBeDefined()
    })
  })

  // ── Messages — LLM call 2 outer (streamText variant) ──

  describe("messages — LLM call 2 outer (streamText, tool result input, multi-tool output)", () => {
    it("input includes a tool result message", () => {
      const s = findSpan("llm2Outer")
      const toolMsg = s.inputMessages.find((m) => m.role === "tool")
      expect(toolMsg).toBeDefined()
    })

    it("output has an assistant message with two tool_call parts", () => {
      const s = findSpan("llm2Outer")
      const assistant = s.outputMessages.find((m) => m.role === "assistant")
      const parts = (assistant as { parts: { type: string; name?: string }[] }).parts
      const toolCalls = parts.filter((p) => p.type === "tool_call")
      expect(toolCalls).toHaveLength(2)
      const names = toolCalls.map((tc) => (tc as { name: string }).name)
      expect(names).toContain("book_hotel")
      expect(names).toContain("search_attractions")
    })
  })

  // ── Messages — LLM call 3 outer ──────────────────────

  describe("messages — LLM call 3 outer (final text response)", () => {
    it("input includes tool result messages", () => {
      const s = findSpan("llm3Outer")
      const toolMsgs = s.inputMessages.filter((m) => m.role === "tool")
      expect(toolMsgs.length).toBeGreaterThanOrEqual(2)
    })

    it("output has an assistant message with a text part", () => {
      const s = findSpan("llm3Outer")
      const assistant = s.outputMessages.find((m) => m.role === "assistant")
      const parts = (assistant as { parts: { type: string; content?: string }[] }).parts
      const textPart = parts.find((p) => p.type === "text")
      expect(textPart).toBeDefined()
      expect((textPart as { content: string }).content).toContain("weather")
    })
  })

  // ── Tool definitions (on inner spans only) ────────────

  describe("tool definitions", () => {
    it("outer LLM spans have no tool definitions", () => {
      expect(findSpan("llm1Outer").toolDefinitions).toHaveLength(0)
      expect(findSpan("llm2Outer").toolDefinitions).toHaveLength(0)
    })

    it("agent and tool spans have no tool definitions", () => {
      expect(findSpan("agent").toolDefinitions).toHaveLength(0)
      expect(findSpan("getWeather").toolDefinitions).toHaveLength(0)
    })
  })
})

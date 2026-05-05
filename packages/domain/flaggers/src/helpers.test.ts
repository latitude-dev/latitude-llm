import type { TraceDetail } from "@domain/spans"
import { describe, expect, it } from "vitest"
import { detectOutputSchemaValidationFlagger, detectToolCallErrorsFlagger } from "./helpers.ts"

type TraceMessage = TraceDetail["allMessages"][number]

function makeTrace(allMessages: TraceDetail["allMessages"]): Pick<TraceDetail, "allMessages"> {
  return { allMessages }
}

function assistantToolCall(id: string, name = "get_weather", argumentsValue: unknown = { city: "BCN" }): TraceMessage {
  return {
    role: "assistant",
    parts: [{ type: "tool_call", id, name, arguments: argumentsValue }],
  }
}

function toolResponse(id: string, response: unknown): TraceMessage {
  return {
    role: "tool",
    parts: [{ type: "tool_call_response", id, response }],
  }
}

function makeAssistantTrace(allMessages: TraceDetail["allMessages"]): TraceDetail {
  return { allMessages } as TraceDetail
}

function assistantText(content: string): TraceDetail["outputMessages"][number] {
  return {
    role: "assistant",
    parts: [{ type: "text", content }],
  }
}

describe("detectToolCallErrorsFlagger", () => {
  it("matches failed tool result payloads and includes the tool name + error snippet + messageIndex", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-weather", { ok: false, error: "timeout" })]),
    )

    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.feedback).toBe('Tool "get_weather" returned error: timeout')
      expect(result.messageIndex).toBe(1)
    }
  })

  it("matches malformed tool interactions with empty tool_call id and returns messageIndex 0", () => {
    const result = detectToolCallErrorsFlagger(makeTrace([assistantToolCall("")]))

    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.feedback).toContain("Malformed tool call")
      expect(result.feedback).toContain("get_weather")
      expect(result.messageIndex).toBe(0)
    }
  })

  it("does not match healthy tool interactions", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-weather", { temp: 22, condition: "sunny" })]),
    )

    expect(result).toEqual({ matched: false })
  })

  it("does not match expected tool 4xx responses", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([
        assistantToolCall("call-grep", "grep"),
        toolResponse("call-grep", { ok: false, statusCode: 404, error: "No matches found" }),
      ]),
    )

    expect(result).toEqual({ matched: false })
  })

  it("still matches tool 5xx responses", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([
        assistantToolCall("call-weather"),
        toolResponse("call-weather", { ok: false, statusCode: 503, error: "Service unavailable" }),
      ]),
    )

    expect(result.matched).toBe(true)
  })

  it("matches duplicated tool call ids", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([assistantToolCall("call-weather"), assistantToolCall("call-weather", "lookup_weather")]),
    )

    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.feedback).toContain("Duplicate tool_call id")
      expect(result.feedback).toContain("lookup_weather")
    }
  })

  it("matches tool calls with blank names after trimming", () => {
    const result = detectToolCallErrorsFlagger(makeTrace([assistantToolCall("call-weather", "   ")]))

    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.feedback).toContain("Malformed tool call")
    }
  })

  it("matches tool responses that appear before any tool call", () => {
    const result = detectToolCallErrorsFlagger(makeTrace([toolResponse("call-weather", { temp: 22 })]))

    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.feedback).toContain("unknown tool_call id")
    }
  })

  it("matches tool responses with unknown tool call ids", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-hotels", { temp: 22 })]),
    )

    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.feedback).toContain("unknown tool_call id")
    }
  })

  it("matches plain-string error responses and quotes the string as the snippet", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([
        assistantToolCall("call-weather"),
        toolResponse("call-weather", "BookingUnavailableError: no rooms available"),
      ]),
    )

    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.feedback).toBe('Tool "get_weather" returned error: BookingUnavailableError: no rooms available')
    }
  })

  it("matches stringified JSON responses with failure status", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-weather", '{"status":"failed"}')]),
    )

    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.feedback).toContain('Tool "get_weather" returned error')
    }
  })

  it("matches explicit isError true responses", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-weather", { isError: true })]),
    )

    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.feedback).toBe('Tool "get_weather" returned an error')
    }
  })

  it("matches explicit success false responses", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-weather", { success: false })]),
    )

    expect(result.matched).toBe(true)
  })

  it("matches non-empty error object responses", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([
        assistantToolCall("call-weather"),
        toolResponse("call-weather", { error: { code: "timeout", message: "upstream timeout" } }),
      ]),
    )

    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.feedback).toContain('Tool "get_weather" returned error: upstream timeout')
    }
  })

  it("matches non-empty errors arrays", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([
        assistantToolCall("call-weather"),
        toolResponse("call-weather", { errors: [{ message: "timeout" }] }),
      ]),
    )

    expect(result.matched).toBe(true)
  })

  it("matches nested array responses containing a failure", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-weather", [{ ok: true }, { status: "error" }])]),
    )

    expect(result.matched).toBe(true)
  })

  it("does not match blank string responses", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-weather", "   ")]),
    )

    expect(result).toEqual({ matched: false })
  })

  it("does not match responses with empty error fields", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([
        assistantToolCall("call-weather"),
        toolResponse("call-weather", { ok: true, error: "", errors: [], status: "success" }),
      ]),
    )

    expect(result).toEqual({ matched: false })
  })

  it("does not match multiple healthy tool call / response pairs", () => {
    const result = detectToolCallErrorsFlagger(
      makeTrace([
        assistantToolCall("call-weather"),
        toolResponse("call-weather", { temp: 22 }),
        assistantToolCall("call-hotels", "search_hotels", { city: "BCN", nights: 2 }),
        toolResponse("call-hotels", { hotels: ["Arts", "W"] }),
      ]),
    )

    expect(result).toEqual({ matched: false })
  })
})

describe("detectOutputSchemaValidationFlagger", () => {
  it("does not match when the assistant output is valid JSON", () => {
    const result = detectOutputSchemaValidationFlagger(makeAssistantTrace([assistantText('{"a": 1, "b": 2}')]))

    expect(result).toEqual({ matched: false })
  })

  it("does not match when the assistant output is not JSON-looking", () => {
    const result = detectOutputSchemaValidationFlagger(makeAssistantTrace([assistantText("Hello! The answer is 42.")]))

    expect(result).toEqual({ matched: false })
  })

  it("matches with the trailing-comma message when JSON is truncated after a comma", () => {
    const result = detectOutputSchemaValidationFlagger(makeAssistantTrace([assistantText('{"a": 1,')]))

    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.feedback).toBe("Assistant output ended with a trailing comma, suggesting truncated JSON")
      expect(result.messageIndex).toBe(0)
    }
  })

  it("matches with the unclosed-string message when JSON is truncated mid-string", () => {
    const result = detectOutputSchemaValidationFlagger(makeAssistantTrace([assistantText('{"msg": "hello')]))

    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.feedback).toBe("Assistant output contains an unclosed JSON string, suggesting truncated output")
      expect(result.messageIndex).toBe(0)
    }
  })

  it("ignores escaped quotes when detecting unclosed strings", () => {
    // The outer string is properly closed — the \" inside should not flip the balance.
    const result = detectOutputSchemaValidationFlagger(
      makeAssistantTrace([assistantText('{"msg": "quoted \\"ok\\" value"}')]),
    )

    expect(result).toEqual({ matched: false })
  })

  it("falls back to the generic parse-failure message when JSON is malformed but not a truncation pattern", () => {
    const result = detectOutputSchemaValidationFlagger(makeAssistantTrace([assistantText("{not valid json}")]))

    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.feedback).toBe("Assistant output failed JSON parse (malformed or truncated structured output)")
      expect(result.messageIndex).toBe(0)
    }
  })
})

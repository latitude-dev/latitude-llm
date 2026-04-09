import type { TraceDetail } from "@domain/spans"
import { describe, expect, it } from "vitest"
import {
  annotationQueueItemStatus,
  annotationQueueItemStatusRankFromTimestamps,
  matchesToolCallErrorsSystemQueue,
} from "./helpers.ts"

const d = (s: string) => new Date(s)
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

describe("annotationQueueItemStatus", () => {
  it("returns completed when completedAt is set", () => {
    expect(annotationQueueItemStatus({ completedAt: d("2026-01-01"), reviewStartedAt: null })).toBe("completed")
  })

  it("returns inProgress when review started but not completed", () => {
    expect(annotationQueueItemStatus({ completedAt: null, reviewStartedAt: d("2026-01-01") })).toBe("inProgress")
  })

  it("returns pending when neither is set", () => {
    expect(annotationQueueItemStatus({ completedAt: null, reviewStartedAt: null })).toBe("pending")
  })
})

describe("annotationQueueItemStatusRankFromTimestamps", () => {
  it("maps to 0 / 1 / 2", () => {
    expect(annotationQueueItemStatusRankFromTimestamps(null, null)).toBe(0)
    expect(annotationQueueItemStatusRankFromTimestamps(null, d("2026-01-01"))).toBe(1)
    expect(annotationQueueItemStatusRankFromTimestamps(d("2026-01-01"), null)).toBe(2)
  })
})

describe("matchesToolCallErrorsSystemQueue", () => {
  it("matches failed tool result payloads in conversation history", () => {
    const matched = matchesToolCallErrorsSystemQueue(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-weather", { ok: false, error: "timeout" })]),
    )

    expect(matched).toBe(true)
  })

  it("matches malformed tool interactions in conversation history", () => {
    const matched = matchesToolCallErrorsSystemQueue(makeTrace([assistantToolCall("")]))

    expect(matched).toBe(true)
  })

  it("does not match healthy tool interactions", () => {
    const matched = matchesToolCallErrorsSystemQueue(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-weather", { temp: 22, condition: "sunny" })]),
    )

    expect(matched).toBe(false)
  })

  it("matches duplicated tool call ids", () => {
    const matched = matchesToolCallErrorsSystemQueue(
      makeTrace([assistantToolCall("call-weather"), assistantToolCall("call-weather", "lookup_weather")]),
    )

    expect(matched).toBe(true)
  })

  it("matches tool calls with blank names after trimming", () => {
    const matched = matchesToolCallErrorsSystemQueue(makeTrace([assistantToolCall("call-weather", "   ")]))

    expect(matched).toBe(true)
  })

  it("matches tool responses that appear before any tool call", () => {
    const matched = matchesToolCallErrorsSystemQueue(makeTrace([toolResponse("call-weather", { temp: 22 })]))

    expect(matched).toBe(true)
  })

  it("matches tool responses with unknown tool call ids", () => {
    const matched = matchesToolCallErrorsSystemQueue(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-hotels", { temp: 22 })]),
    )

    expect(matched).toBe(true)
  })

  it("matches plain-string error responses", () => {
    const matched = matchesToolCallErrorsSystemQueue(
      makeTrace([
        assistantToolCall("call-weather"),
        toolResponse("call-weather", "BookingUnavailableError: no rooms available"),
      ]),
    )

    expect(matched).toBe(true)
  })

  it("matches stringified JSON responses with failure status", () => {
    const matched = matchesToolCallErrorsSystemQueue(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-weather", '{"status":"failed"}')]),
    )

    expect(matched).toBe(true)
  })

  it("matches explicit isError true responses", () => {
    const matched = matchesToolCallErrorsSystemQueue(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-weather", { isError: true })]),
    )

    expect(matched).toBe(true)
  })

  it("matches explicit success false responses", () => {
    const matched = matchesToolCallErrorsSystemQueue(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-weather", { success: false })]),
    )

    expect(matched).toBe(true)
  })

  it("matches non-empty error fields", () => {
    const matched = matchesToolCallErrorsSystemQueue(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-weather", { error: { code: "timeout" } })]),
    )

    expect(matched).toBe(true)
  })

  it("matches non-empty errors arrays", () => {
    const matched = matchesToolCallErrorsSystemQueue(
      makeTrace([
        assistantToolCall("call-weather"),
        toolResponse("call-weather", { errors: [{ message: "timeout" }] }),
      ]),
    )

    expect(matched).toBe(true)
  })

  it("matches nested array responses containing a failure", () => {
    const matched = matchesToolCallErrorsSystemQueue(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-weather", [{ ok: true }, { status: "error" }])]),
    )

    expect(matched).toBe(true)
  })

  it("does not match blank string responses", () => {
    const matched = matchesToolCallErrorsSystemQueue(
      makeTrace([assistantToolCall("call-weather"), toolResponse("call-weather", "   ")]),
    )

    expect(matched).toBe(false)
  })

  it("does not match responses with empty error fields", () => {
    const matched = matchesToolCallErrorsSystemQueue(
      makeTrace([
        assistantToolCall("call-weather"),
        toolResponse("call-weather", { ok: true, error: "", errors: [], status: "success" }),
      ]),
    )

    expect(matched).toBe(false)
  })

  it("does not match multiple healthy tool call / response pairs", () => {
    const matched = matchesToolCallErrorsSystemQueue(
      makeTrace([
        assistantToolCall("call-weather"),
        toolResponse("call-weather", { temp: 22 }),
        assistantToolCall("call-hotels", "search_hotels", { city: "BCN", nights: 2 }),
        toolResponse("call-hotels", { hotels: ["Arts", "W"] }),
      ]),
    )

    expect(matched).toBe(false)
  })
})

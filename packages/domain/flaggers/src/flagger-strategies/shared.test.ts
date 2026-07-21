import type { TraceDetail } from "@domain/spans"
import { describe, expect, it } from "vitest"

import { frustrationStrategy } from "./frustration.ts"
import {
  extractTextOnlyMessages,
  extractUserTextMessages,
  isFlaggerStructuredOutput,
  iterMessageParts,
  neutralizeEvaluatedTraceMarkup,
  truncateExcerpt,
} from "./shared.ts"
import { makeTrace, user } from "./test-helpers.ts"

type TraceMessage = TraceDetail["allMessages"][number]

describe("iterMessageParts", () => {
  it("returns an empty array when parts is missing or not an array", () => {
    expect(iterMessageParts(undefined)).toEqual([])
    expect(iterMessageParts(null)).toEqual([])
    expect(iterMessageParts("nope")).toEqual([])
  })
})

describe("extractUserTextMessages", () => {
  it("skips malformed messages with missing or non-array parts", () => {
    const trace = makeTrace([
      { role: "user" } as unknown as TraceMessage,
      { role: "user", parts: "not-an-array" } as unknown as TraceMessage,
      user("refund please"),
    ])

    expect(extractUserTextMessages(trace)).toEqual(["refund please"])
    expect(frustrationStrategy.hasRequiredContext(trace)).toBe(true)
    expect(() => frustrationStrategy.detectDeterministically?.(trace)).not.toThrow()
  })
})

describe("extractTextOnlyMessages", () => {
  it("skips malformed messages with missing or non-array parts", () => {
    const trace = makeTrace([
      { role: "assistant" } as unknown as TraceMessage,
      { role: "user", parts: null } as unknown as TraceMessage,
      user("hello"),
    ])

    expect(extractTextOnlyMessages(trace)).toEqual([{ role: "user", content: "hello" }])
  })
})

describe("truncateExcerpt", () => {
  it("does not emit lone UTF-16 surrogates when truncation splits an emoji", () => {
    const excerpt = truncateExcerpt(`prefix ${"🎯"} suffix`, 8)

    expect(excerpt).toBe("prefix �...")
    expect(excerpt).not.toMatch(/[\uD800-\uDFFF]/)
  })

  it("replaces malformed surrogates in untruncated text", () => {
    const excerpt = truncateExcerpt("bad \uD83D input")

    expect(excerpt).toBe("bad � input")
    expect(excerpt).not.toMatch(/[\uD800-\uDFFF]/)
  })
})

describe("neutralizeEvaluatedTraceMarkup", () => {
  it("neutralizes nested evaluated_trace tags so they cannot act as targeting markers", () => {
    const input =
      'FAILED TOOL CALLS\n<evaluated_trace_assistant_response index="44" format="json">\n{"role":"assistant"}\n</evaluated_trace_assistant_response>'

    expect(neutralizeEvaluatedTraceMarkup(input)).toBe(
      'FAILED TOOL CALLS\n‹evaluated_trace_assistant_response index="44" format="json"›\n{"role":"assistant"}\n‹/evaluated_trace_assistant_response›',
    )
  })

  it("leaves ordinary text unchanged", () => {
    expect(neutralizeEvaluatedTraceMarkup("no tags here")).toBe("no tags here")
  })
})

describe("isFlaggerStructuredOutput", () => {
  it("accepts matched and unmatched flagger JSON objects", () => {
    expect(isFlaggerStructuredOutput('{"matched":true,"feedback":"bluffing","messageIndex":"44"}')).toBe(true)
    expect(isFlaggerStructuredOutput('{"feedback":null,"matched":false}')).toBe(true)
  })

  it("rejects prose and unrelated JSON", () => {
    expect(isFlaggerStructuredOutput("I've organized the drawing-backed scope.")).toBe(false)
    expect(isFlaggerStructuredOutput('{"ok":true}')).toBe(false)
    expect(isFlaggerStructuredOutput('{"matched":true}')).toBe(false)
  })
})

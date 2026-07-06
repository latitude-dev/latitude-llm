import type { TraceDetail } from "@domain/spans"
import { describe, expect, it } from "vitest"

import { frustrationStrategy } from "./frustration.ts"
import { extractTextOnlyMessages, extractUserTextMessages, truncateExcerpt } from "./shared.ts"
import { makeTrace, user } from "./test-helpers.ts"

type TraceMessage = TraceDetail["allMessages"][number]

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

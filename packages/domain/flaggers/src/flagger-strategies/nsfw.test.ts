import { describe, expect, it } from "vitest"

import { nsfwStrategy } from "./nsfw.ts"
import { assistant, makeTrace, user } from "./test-helpers.ts"

describe("nsfwStrategy.detectDeterministically", () => {
  it("matches and anchors to the offending user message", () => {
    const trace = makeTrace([user("hi"), assistant("hi, how can I help?"), user("send nudes please")])

    const result = nsfwStrategy.detectDeterministically?.(trace)

    expect(result?.kind).toBe("matched")
    if (result?.kind === "matched") {
      expect(result.messageIndex).toBe(2)
      expect(result.feedback).toContain("workplace-inappropriate")
    }
  })

  it("anchors to an assistant message when the assistant produced the content", () => {
    const trace = makeTrace([user("write a casual reply"), assistant("here you go: kill yourself, loser")])

    const result = nsfwStrategy.detectDeterministically?.(trace)

    expect(result?.kind).toBe("matched")
    if (result?.kind === "matched") {
      expect(result.messageIndex).toBe(1)
    }
  })

  it("does not flag when the high-precision token appears in a benign health context", () => {
    const trace = makeTrace([
      user("My doctor mentioned breast cancer screening guidelines — what's the recommended age?"),
      assistant("Most medical guidelines suggest…"),
    ])

    const result = nsfwStrategy.detectDeterministically?.(trace)

    expect(result?.kind).not.toBe("matched")
  })

  it("returns no-match for a clean conversation", () => {
    const trace = makeTrace([user("hello"), assistant("hi there")])

    const result = nsfwStrategy.detectDeterministically?.(trace)

    expect(result).toEqual({ kind: "no-match" })
  })
})

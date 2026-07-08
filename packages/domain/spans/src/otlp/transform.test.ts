import { describe, expect, it } from "vitest"
import { normalizeParentSpanId } from "./transform.ts"

describe("normalizeParentSpanId", () => {
  it("maps OTEL's all-zero root parent id to an empty string", () => {
    expect(normalizeParentSpanId("0000000000000000")).toBe("")
  })

  it("keeps empty and non-root parent ids unchanged", () => {
    expect(normalizeParentSpanId("")).toBe("")
    expect(normalizeParentSpanId(undefined)).toBe("")
    expect(normalizeParentSpanId("abcd1234abcd1234")).toBe("abcd1234abcd1234")
  })
})

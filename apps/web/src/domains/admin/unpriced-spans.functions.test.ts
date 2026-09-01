import { describe, expect, it } from "vitest"
import { adminListUnpricedSpansInputSchema } from "./unpriced-spans.functions.ts"

describe("adminListUnpricedSpansInputSchema", () => {
  it("defaults the window by leaving it unset for the use-case to decide", () => {
    expect(adminListUnpricedSpansInputSchema.parse({})).toEqual({})
  })

  it("accepts a caller-supplied window", () => {
    expect(adminListUnpricedSpansInputSchema.parse({ windowDays: 7 })).toEqual({ windowDays: 7 })
  })

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 1.5],
    // Capped so a hand-edited query param cannot turn the page into a full-history table scan.
    ["beyond the cap", 91],
  ])("rejects a %s window", (_case, windowDays) => {
    expect(adminListUnpricedSpansInputSchema.safeParse({ windowDays }).success).toBe(false)
  })
})

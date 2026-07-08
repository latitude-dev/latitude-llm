import { describe, expect, it } from "vitest"
import { extractSignalVisualIds, formatSignalVisualId, isSignalVisualId } from "./visual-id.ts"

describe("formatSignalVisualId", () => {
  it("zero-pads short sequence numbers", () => {
    expect(formatSignalVisualId(1)).toBe("LAT-001")
    expect(formatSignalVisualId(42)).toBe("LAT-042")
    expect(formatSignalVisualId(999)).toBe("LAT-999")
  })

  it("does not pad once the suffix reaches four digits", () => {
    expect(formatSignalVisualId(1000)).toBe("LAT-1000")
  })
})

describe("extractSignalVisualIds", () => {
  it("finds unique visual ids in free text", () => {
    expect(extractSignalVisualIds("Fix LAT-042 in checkout and follow up on lat-042 / LAT-1000")).toEqual([
      "LAT-042",
      "LAT-1000",
    ])
  })

  it("ignores unrelated LAT tokens", () => {
    expect(extractSignalVisualIds("LAT-12 is too short")).toEqual([])
  })
})

describe("isSignalVisualId", () => {
  it("accepts canonical ids", () => {
    expect(isSignalVisualId("LAT-001")).toBe(true)
    expect(isSignalVisualId("lat-999")).toBe(true)
  })

  it("rejects malformed ids", () => {
    expect(isSignalVisualId("LAT-12")).toBe(false)
    expect(isSignalVisualId("SIG-001")).toBe(false)
  })
})

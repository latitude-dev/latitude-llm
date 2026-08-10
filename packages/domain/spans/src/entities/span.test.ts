import { describe, expect, it } from "vitest"
import { parseCostSource, type StoredCostSignals } from "./span.ts"

const stored = (overrides: Partial<StoredCostSignals> = {}): StoredCostSignals => ({
  costTotalMicrocents: 0,
  costIsEstimated: false,
  hasTokens: false,
  ...overrides,
})

describe("parseCostSource", () => {
  it.each([
    "provider_reported",
    "estimated",
    "unpriced",
    "no_tokens",
    "unknown",
  ])("passes through the stored value %s", (value) => {
    // Signals that would classify differently, to prove the stored value wins.
    expect(parseCostSource(value, stored({ costTotalMicrocents: 500, hasTokens: true }))).toBe(value)
  })

  // A misspelling must not be trusted as a source; it falls through to the stored signals.
  it("classifies a value outside the enum from the signals instead of trusting it", () => {
    expect(parseCostSource("provider-reported", stored({ costTotalMicrocents: 500 }))).toBe("provider_reported")
    expect(parseCostSource("provider-reported", stored({ hasTokens: true }))).toBe("unknown")
  })

  describe("rows stored before the column existed", () => {
    it("reads a reported non-zero cost as provider_reported", () => {
      expect(parseCostSource("", stored({ costTotalMicrocents: 500, hasTokens: true }))).toBe("provider_reported")
    })

    it("reads an estimated non-zero cost as estimated", () => {
      expect(parseCostSource("", stored({ costTotalMicrocents: 500, costIsEstimated: true, hasTokens: true }))).toBe(
        "estimated",
      )
    })

    // The whole point of the column: this row is either free or unpriced and the old columns cannot say.
    it("leaves a zero cost with tokens unknown rather than calling it free", () => {
      expect(parseCostSource("", stored({ hasTokens: true }))).toBe("unknown")
    })

    it("reads a zero cost with no tokens as no_tokens", () => {
      expect(parseCostSource("", stored())).toBe("no_tokens")
    })
  })
})

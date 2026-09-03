import { describe, expect, it } from "vitest"
import { isSignalEligibleForScoring, type SignalScoringEligibility } from "./score-eligibility.ts"

const promotedAt = new Date("2026-08-01T00:00:00.000Z")

const makeSignal = (overrides: Partial<SignalScoringEligibility> = {}): SignalScoringEligibility => ({
  origin: "system",
  promotedAt,
  ignoredAt: null,
  deletedAt: null,
  ...overrides,
})

describe("isSignalEligibleForScoring", () => {
  it("accepts promoted system signals", () => {
    expect(isSignalEligibleForScoring(makeSignal())).toBe(true)
  })

  it("rejects unpromoted signals", () => {
    expect(isSignalEligibleForScoring(makeSignal({ promotedAt: null }))).toBe(false)
  })

  it("rejects user-created signals", () => {
    expect(isSignalEligibleForScoring(makeSignal({ origin: "user" }))).toBe(false)
  })

  it("rejects ignored signals", () => {
    expect(isSignalEligibleForScoring(makeSignal({ ignoredAt: promotedAt }))).toBe(false)
  })

  it("rejects deleted signals", () => {
    expect(isSignalEligibleForScoring(makeSignal({ deletedAt: promotedAt }))).toBe(false)
  })
})

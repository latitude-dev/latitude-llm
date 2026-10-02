import { describe, expect, it } from "vitest"
import { attributeOutcomeWindow } from "./attribute-outcome.ts"
import type { OutcomeDegradationEstimate } from "./estimate-outcome.ts"

const WEIGHT = 0.75

const degradation = (input: { readonly analyzed: number; readonly degraded: number }): OutcomeDegradationEstimate => ({
  applied: true,
  analyzedSessionCount: input.analyzed,
  degradedSessionCount: input.degraded,
  degradedShare: input.degraded / input.analyzed,
  degradedWeight: WEIGHT,
})

/** The score a window with this degradation would publish, given an undegraded rate of `rate`. */
const observedScore = (rate: number, share: number) => rate * (1 - (1 - WEIGHT) * share)

describe("attributeOutcomeWindow", () => {
  it("divides the deficit exactly across the kinds that caused it", () => {
    const sessions = new Map<string, readonly string[]>([
      ["s1", ["user_frustration"]],
      ["s2", ["abandonment"]],
      ["s3", ["user_frustration", "abandonment"]],
      ["s4", []],
    ])
    const result = attributeOutcomeWindow({
      degradedKindsBySession: sessions,
      degradation: degradation({ analyzed: 4, degraded: 3 }),
      observedScore: observedScore(80, 3 / 4),
    })

    const explained = result.rows.reduce((total, row) => total + row.attributedDeficit, 0)
    expect(explained).toBeCloseTo(result.totalDeficit, 10)
    expect(result.residual).toBeCloseTo(0, 10)
  })

  it("splits a session degraded by two kinds evenly between them", () => {
    // Each kind is individually sufficient, so neither can claim more of the session than the other.
    const result = attributeOutcomeWindow({
      degradedKindsBySession: new Map([["s1", ["user_frustration", "abandonment"]]]),
      degradation: degradation({ analyzed: 4, degraded: 1 }),
      observedScore: observedScore(80, 1 / 4),
    })

    const [first, second] = result.rows
    expect(first?.attributedDeficit).toBeCloseTo(second?.attributedDeficit as number, 10)
  })

  it("recovers the whole deficit when one kind is the only cause", () => {
    const result = attributeOutcomeWindow({
      degradedKindsBySession: new Map([
        ["s1", ["user_frustration"]],
        ["s2", ["user_frustration"]],
        ["s3", []],
      ]),
      degradation: degradation({ analyzed: 3, degraded: 2 }),
      observedScore: observedScore(80, 2 / 3),
    })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.fixGain).toBeCloseTo(result.totalDeficit, 10)
  })

  it("does not credit a fix gain for sessions another kind still degrades", () => {
    // Removing frustration leaves s2 degraded by abandonment, so the gain is below its share of
    // the deficit. Summing fix gains would promise back more than the deficit contains.
    const result = attributeOutcomeWindow({
      degradedKindsBySession: new Map([
        ["s1", ["user_frustration"]],
        ["s2", ["user_frustration", "abandonment"]],
      ]),
      degradation: degradation({ analyzed: 4, degraded: 2 }),
      observedScore: observedScore(80, 2 / 4),
    })

    const frustration = result.rows.find((row) => row.causeId === "moment:user_frustration")
    expect(frustration?.fixGain).toBeLessThan(result.totalDeficit)
    expect(frustration?.fixGain).toBeGreaterThan(0)
  })

  it("attributes nothing when the component never applied", () => {
    const result = attributeOutcomeWindow({
      degradedKindsBySession: new Map([["s1", ["user_frustration"]]]),
      degradation: { ...degradation({ analyzed: 4, degraded: 1 }), applied: false },
      observedScore: 80,
    })

    expect(result.rows).toEqual([])
    expect(result.totalDeficit).toBe(0)
  })

  it("names its claim as association, never as measurement", () => {
    const result = attributeOutcomeWindow({
      degradedKindsBySession: new Map([["s1", ["abandonment"]]]),
      degradation: degradation({ analyzed: 4, degraded: 1 }),
      observedScore: observedScore(80, 1 / 4),
    })

    // The rule firing is observed; that the session would otherwise have been clean is modelled.
    expect(result.rows[0]?.evidence).toBe("associated")
  })
})

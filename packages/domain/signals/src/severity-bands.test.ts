import { describe, expect, it } from "vitest"
import { levelForImpact } from "./severity-bands.ts"

// Well above the sample floor: these cases are about the bands, not the guard.
const at = (affectedSessionsPercent: number, escalating = false) =>
  levelForImpact({ affectedSessionsPercent, escalating, affectedSessions: 50 })

describe("levelForImpact", () => {
  it("reads the share of sessions, not a count", () => {
    expect(at(0)).toBe("low")
    expect(at(0.005)).toBe("low")
    expect(at(0.01)).toBe("medium")
    expect(at(0.05)).toBe("high")
    expect(at(0.2)).toBe("urgent")
    expect(at(1)).toBe("urgent")
  })

  // The same four occurrences are most of a small project and nothing in a large
  // one, which is the whole reason this is a share rather than a threshold count.
  it("rates identical counts differently by project size", () => {
    expect(at(4 / 10)).toBe("urgent")
    expect(at(4 / 20_000)).toBe("low")
  })

  it("raises one tier while escalating", () => {
    expect(at(0, true)).toBe("medium")
    expect(at(0.01, true)).toBe("high")
    expect(at(0.05, true)).toBe("urgent")
  })

  it("cannot escalate past the top of the scale", () => {
    expect(at(0.9, true)).toBe("urgent")
  })

  // Recomputed rather than latched: the same input without the escalation flag
  // returns the lower level, which is what lets a passed spike come back down.
  it("returns to the measured level once the escalation ends", () => {
    expect(at(0.02, true)).toBe("high")
    expect(at(0.02, false)).toBe("medium")
  })

  // A quarter of the signals these bands called `urgent` in production affected
  // exactly one session — arithmetically they sit in projects of five sessions or
  // fewer, since one session cannot otherwise reach 20%.
  it("does not read a share off too few sessions", () => {
    expect(levelForImpact({ affectedSessionsPercent: 0.34, escalating: false, affectedSessions: 1 })).toBe("low")
    expect(levelForImpact({ affectedSessionsPercent: 0.8, escalating: false, affectedSessions: 4 })).toBe("low")
  })

  it("reads the share as soon as enough sessions are affected", () => {
    expect(levelForImpact({ affectedSessionsPercent: 0.34, escalating: false, affectedSessions: 5 })).toBe("urgent")
  })

  // The guard is on volume's claim, not on severity. A detector floor and an
  // escalation both still apply to a signal nobody has seen spread.
  it("leaves floors and escalation untouched below the sample floor", () => {
    expect(
      levelForImpact({ affectedSessionsPercent: 1, escalating: false, affectedSessions: 1, floor: "urgent" }),
    ).toBe("urgent")
    expect(levelForImpact({ affectedSessionsPercent: 1, escalating: true, affectedSessions: 1 })).toBe("medium")
  })

  // A card number read back to one customer out of five thousand sessions. The
  // measurement says nobody is affected and it is still urgent.
  it("never reports below the floor, however rare the signal is", () => {
    expect(
      levelForImpact({ affectedSessionsPercent: 1 / 5000, escalating: false, affectedSessions: 50, floor: "urgent" }),
    ).toBe("urgent")
  })

  it("lets volume raise the level above the floor", () => {
    expect(
      levelForImpact({ affectedSessionsPercent: 0.3, escalating: false, affectedSessions: 50, floor: "low" }),
    ).toBe("urgent")
  })

  it("still escalates a floored signal one tier", () => {
    expect(
      levelForImpact({ affectedSessionsPercent: 0.06, escalating: true, affectedSessions: 50, floor: "medium" }),
    ).toBe("urgent")
  })

  it("ignores a floor at or below the measurement", () => {
    expect(
      levelForImpact({ affectedSessionsPercent: 0.05, escalating: false, affectedSessions: 50, floor: "high" }),
    ).toBe("high")
    expect(
      levelForImpact({ affectedSessionsPercent: 0.05, escalating: false, affectedSessions: 50, floor: null }),
    ).toBe("high")
  })
})

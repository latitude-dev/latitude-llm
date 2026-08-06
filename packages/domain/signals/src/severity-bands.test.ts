import { describe, expect, it } from "vitest"
import { levelForImpact } from "./severity-bands.ts"

const at = (affectedSessionsPercent: number, escalating = false) =>
  levelForImpact({ affectedSessionsPercent, escalating })

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
})

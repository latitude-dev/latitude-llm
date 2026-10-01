import { describe, expect, it } from "vitest"
import { survivalInterval, survivalOverReferenceRun } from "./reference-run.ts"

describe("survivalOverReferenceRun", () => {
  it("is one hundred when the adverse event was never observed", () => {
    expect(survivalOverReferenceRun({ adverseRate: 0, referenceRunSessions: 20 })).toBe(100)
  })

  it("is zero when every session was adverse", () => {
    expect(survivalOverReferenceRun({ adverseRate: 1, referenceRunSessions: 20 })).toBe(0)
  })

  it("falls as the adverse rate rises", () => {
    const scores = [0, 0.01, 0.05, 0.2].map((adverseRate) =>
      survivalOverReferenceRun({ adverseRate, referenceRunSessions: 20 }),
    )
    expect(scores).toEqual([...scores].sort((left, right) => right - left))
  })

  it("falls as the horizon lengthens for the same rate", () => {
    const short = survivalOverReferenceRun({ adverseRate: 0.01, referenceRunSessions: 20 })
    const long = survivalOverReferenceRun({ adverseRate: 0.01, referenceRunSessions: 100 })
    expect(long).toBeLessThan(short)
  })

  it("clamps a rate outside zero through one instead of returning a nonsense score", () => {
    expect(survivalOverReferenceRun({ adverseRate: -1, referenceRunSessions: 20 })).toBe(100)
    expect(survivalOverReferenceRun({ adverseRate: 5, referenceRunSessions: 20 })).toBe(0)
  })
})

describe("survivalInterval", () => {
  it("swaps the bounds, because the transform is monotone decreasing", () => {
    const result = survivalInterval({ interval: { lower: 0.01, upper: 0.1 }, referenceRunSessions: 20 })

    expect(result.lower).toBeCloseTo(survivalOverReferenceRun({ adverseRate: 0.1, referenceRunSessions: 20 }), 9)
    expect(result.upper).toBeCloseTo(survivalOverReferenceRun({ adverseRate: 0.01, referenceRunSessions: 20 }), 9)
    expect(result.lower).toBeLessThan(result.upper)
  })
})

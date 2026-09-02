import { describe, expect, it } from "vitest"
import { signalIdentityFields } from "./signal.ts"

describe("signal score evidence response schema", () => {
  it("requires a list and accepts diagnostic signals", () => {
    expect(signalIdentityFields.scoreEvidence.parse([])).toEqual([])
    expect(signalIdentityFields.scoreEvidence.safeParse(undefined).success).toBe(false)
    expect(signalIdentityFields.scoreEvidence.safeParse(null).success).toBe(false)
  })

  it("accepts valid signal roles and rejects successful defense", () => {
    const scoreEvidence = [
      { scoreDimension: "outcome", role: "taskOutcome" },
      { scoreDimension: "reliability", role: "operationalIncident" },
      { scoreDimension: "cost", role: "spendEfficiency" },
      { scoreDimension: "speed", role: "criticalPathEfficiency" },
      { scoreDimension: "safety", role: "confirmedHarm" },
    ]

    expect(signalIdentityFields.scoreEvidence.parse(scoreEvidence)).toEqual(scoreEvidence)
    expect(
      signalIdentityFields.scoreEvidence.safeParse([{ scoreDimension: "safety", role: "successfulDefense" }]).success,
    ).toBe(false)
  })
})

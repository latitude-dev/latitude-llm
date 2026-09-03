import { describe, expect, it } from "vitest"
import { type SignalScoreEvidence, signalSchema, signalScoreEvidenceSchema } from "./signal.ts"

const validEvidence = [
  { scoreDimension: "outcome", role: "taskOutcome" },
  { scoreDimension: "reliability", role: "completionOutcome" },
  { scoreDimension: "reliability", role: "operationalIncident" },
  { scoreDimension: "cost", role: "spendEfficiency" },
  { scoreDimension: "speed", role: "criticalPathEfficiency" },
  { scoreDimension: "safety", role: "confirmedHarm" },
  { scoreDimension: "safety", role: "exposure" },
] satisfies readonly SignalScoreEvidence[]

describe("signalScoreEvidenceSchema", () => {
  it("accepts the defect-compatible evidence roles", () => {
    for (const evidence of validEvidence) {
      expect(signalScoreEvidenceSchema.parse(evidence)).toEqual(evidence)
    }
  })

  it("rejects successful defense as signal evidence", () => {
    expect(signalScoreEvidenceSchema.safeParse({ scoreDimension: "safety", role: "successfulDefense" }).success).toBe(
      false,
    )
  })
})

describe("signalSchema scoreEvidence", () => {
  it("requires a non-null list and accepts an empty diagnostic classification", () => {
    expect(signalSchema.shape.scoreEvidence.safeParse(undefined).success).toBe(false)
    expect(signalSchema.shape.scoreEvidence.safeParse(null).success).toBe(false)
    expect(signalSchema.shape.scoreEvidence.parse([])).toEqual([])
  })
})

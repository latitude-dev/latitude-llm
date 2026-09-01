import { describe, expect, it } from "vitest"
import {
  SCORE_DIMENSIONS,
  type ScoreEvidenceContract,
  scoreDimensionSchema,
  scoreEvidenceContractSchema,
} from "./index.ts"

const validEvidence = [
  { scoreDimension: "outcome", role: "taskOutcome" },
  { scoreDimension: "reliability", role: "completionOutcome" },
  { scoreDimension: "reliability", role: "operationalIncident" },
  { scoreDimension: "cost", role: "spendEfficiency" },
  { scoreDimension: "speed", role: "criticalPathEfficiency" },
  { scoreDimension: "safety", role: "confirmedHarm" },
  { scoreDimension: "safety", role: "exposure" },
  { scoreDimension: "safety", role: "successfulDefense" },
] satisfies readonly ScoreEvidenceContract[]

describe("scoreDimensionSchema", () => {
  it("defines the five Agent Score dimensions", () => {
    expect(SCORE_DIMENSIONS).toEqual(["outcome", "reliability", "cost", "speed", "safety"])
    expect(SCORE_DIMENSIONS.every((dimension) => scoreDimensionSchema.safeParse(dimension).success)).toBe(true)
  })

  it("rejects values outside the Agent Score vocabulary", () => {
    expect(scoreDimensionSchema.safeParse("performance").success).toBe(false)
  })
})

describe("scoreEvidenceContractSchema", () => {
  it("accepts every valid dimension and role pair", () => {
    for (const evidence of validEvidence) {
      expect(scoreEvidenceContractSchema.parse(evidence)).toEqual(evidence)
    }
  })

  it("rejects roles paired with the wrong dimension", () => {
    const invalidEvidence = [
      { scoreDimension: "outcome", role: "completionOutcome" },
      { scoreDimension: "reliability", role: "taskOutcome" },
      { scoreDimension: "cost", role: "criticalPathEfficiency" },
      { scoreDimension: "speed", role: "spendEfficiency" },
      { scoreDimension: "safety", role: "operationalIncident" },
    ]

    expect(invalidEvidence.every((evidence) => !scoreEvidenceContractSchema.safeParse(evidence).success)).toBe(true)
  })

  it("requires both the dimension and role", () => {
    expect(scoreEvidenceContractSchema.safeParse({ role: "taskOutcome" }).success).toBe(false)
    expect(scoreEvidenceContractSchema.safeParse({ scoreDimension: "outcome" }).success).toBe(false)
  })
})

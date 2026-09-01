import { describe, expect, it } from "vitest"
import {
  findDominantMappedSignalFlaggerSlug,
  getSignalScoreEvidenceForFlagger,
  isMappedSignalFlaggerSlug,
} from "./score-evidence.ts"

const expectedEvidence = {
  "task-success": [{ scoreDimension: "outcome", role: "taskOutcome" }],
  "tool-call-errors": [
    { scoreDimension: "reliability", role: "operationalIncident" },
    { scoreDimension: "cost", role: "spendEfficiency" },
    { scoreDimension: "speed", role: "criticalPathEfficiency" },
  ],
  "output-schema-validation": [
    { scoreDimension: "outcome", role: "taskOutcome" },
    { scoreDimension: "reliability", role: "completionOutcome" },
  ],
  "empty-response": [
    { scoreDimension: "outcome", role: "taskOutcome" },
    { scoreDimension: "reliability", role: "completionOutcome" },
  ],
  trashing: [
    { scoreDimension: "cost", role: "spendEfficiency" },
    { scoreDimension: "speed", role: "criticalPathEfficiency" },
  ],
  "low-cache-hit-rate": [{ scoreDimension: "cost", role: "spendEfficiency" }],
  forgetting: [
    { scoreDimension: "outcome", role: "taskOutcome" },
    { scoreDimension: "cost", role: "spendEfficiency" },
  ],
  bluffing: [{ scoreDimension: "outcome", role: "taskOutcome" }],
  incompletion: [{ scoreDimension: "outcome", role: "taskOutcome" }],
  laziness: [
    { scoreDimension: "outcome", role: "taskOutcome" },
    { scoreDimension: "speed", role: "criticalPathEfficiency" },
  ],
  refusal: [{ scoreDimension: "outcome", role: "taskOutcome" }],
  frustration: [{ scoreDimension: "outcome", role: "taskOutcome" }],
  "pii-leakage": [
    { scoreDimension: "safety", role: "confirmedHarm" },
    { scoreDimension: "safety", role: "exposure" },
  ],
  jailbreaking: [
    { scoreDimension: "safety", role: "confirmedHarm" },
    { scoreDimension: "safety", role: "exposure" },
  ],
  nsfw: [{ scoreDimension: "safety", role: "exposure" }],
} as const

describe("signal flagger score evidence", () => {
  it.each(Object.entries(expectedEvidence))("maps %s to its static evidence", (slug, evidence) => {
    expect(isMappedSignalFlaggerSlug(slug)).toBe(true)
    expect(getSignalScoreEvidenceForFlagger(slug)).toEqual(evidence)
  })

  it("does not map an unknown flagger", () => {
    expect(isMappedSignalFlaggerSlug("unknown")).toBe(false)
    expect(getSignalScoreEvidenceForFlagger("unknown")).toBeNull()
  })
})

describe("findDominantMappedSignalFlaggerSlug", () => {
  it("returns a mapped flagger with a strict majority", () => {
    expect(findDominantMappedSignalFlaggerSlug(["refusal", "refusal", "bluffing"])).toBe("refusal")
  })

  it("uses the whole sample as the denominator", () => {
    expect(findDominantMappedSignalFlaggerSlug(["refusal", "refusal", null, "unknown", undefined])).toBeNull()
    expect(findDominantMappedSignalFlaggerSlug(["refusal", "refusal", "refusal", "unknown", null])).toBe("refusal")
  })

  it("rejects a tie or mixed sample without a strict majority", () => {
    expect(findDominantMappedSignalFlaggerSlug(["refusal", "refusal", "bluffing", "bluffing"])).toBeNull()
    expect(findDominantMappedSignalFlaggerSlug(["refusal", "bluffing", "incompletion"])).toBeNull()
  })

  it("rejects an unmapped strict majority", () => {
    expect(findDominantMappedSignalFlaggerSlug(["unknown", "unknown", "refusal"])).toBeNull()
  })

  it("uses at most the 200 newest entries", () => {
    const newest = [...Array<string>(100).fill("refusal"), ...Array<string>(100).fill("bluffing")]
    expect(findDominantMappedSignalFlaggerSlug([...newest, ...Array<string>(10).fill("refusal")])).toBeNull()
  })
})

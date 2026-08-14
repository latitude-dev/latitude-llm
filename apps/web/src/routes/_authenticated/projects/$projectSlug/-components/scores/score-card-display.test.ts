import { describe, expect, it } from "vitest"
import { scoreCardEvaluationVerdict, scoreCardLinkedSignalId, scoreCardSourceTitle } from "./score-card-display.ts"

describe("scoreCardSourceTitle", () => {
  it("does not surface evaluation identity", () => {
    expect(scoreCardSourceTitle({ source: "evaluation", sourceId: "eval-id" })).toBeNull()
  })

  it("keeps custom source ids as the title", () => {
    expect(scoreCardSourceTitle({ source: "custom", sourceId: "api-source" })).toBe("api-source")
  })
})

describe("scoreCardLinkedSignalId", () => {
  it("prefers the occurrence signal id", () => {
    expect(scoreCardLinkedSignalId({ signalId: "occurrence", evaluationSignalId: "detector" })).toBe("occurrence")
  })

  it("falls back to the evaluation's parent signal for absent runs", () => {
    expect(scoreCardLinkedSignalId({ signalId: null, evaluationSignalId: "detector" })).toBe("detector")
  })
})

describe("scoreCardEvaluationVerdict", () => {
  it("labels a passing evaluation as Present", () => {
    expect(scoreCardEvaluationVerdict({ source: "evaluation", errored: false, passed: true })).toBe("Present")
  })

  it("labels a failing evaluation as Absent", () => {
    expect(scoreCardEvaluationVerdict({ source: "evaluation", errored: false, passed: false })).toBe("Absent")
  })

  it("hides the verdict for errored evaluations and other sources", () => {
    expect(scoreCardEvaluationVerdict({ source: "evaluation", errored: true, passed: false })).toBeNull()
    expect(scoreCardEvaluationVerdict({ source: "annotation", errored: false, passed: false })).toBeNull()
  })
})

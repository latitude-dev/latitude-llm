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
  it("always uses the evaluation's parent signal when present", () => {
    expect(scoreCardLinkedSignalId({ signalId: "occurrence", evaluationSignalId: "detector" })).toBe("detector")
  })

  it("falls back to a stamped signal id when the evaluation has no parent", () => {
    expect(scoreCardLinkedSignalId({ signalId: "stamped", evaluationSignalId: null })).toBe("stamped")
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

import { describe, expect, it } from "vitest"
import {
  scoreCardEvaluationVerdict,
  scoreCardIsAbsentEvaluation,
  scoreCardLinkedSignalId,
  scoreCardShouldShowFeedback,
  scoreCardShouldShowValue,
  scoreCardSignalLabel,
  scoreCardSourceTitle,
} from "./score-card-display.ts"

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

describe("scoreCardSignalLabel", () => {
  it("prefers the signal name, then the slug, and never a raw id", () => {
    expect(scoreCardSignalLabel({ name: "Hallucination", slug: "LAT-ABCD" })).toBe("Hallucination")
    expect(scoreCardSignalLabel({ name: null, slug: "LAT-ABCD" })).toBe("LAT-ABCD")
    expect(scoreCardSignalLabel({ name: null, slug: null })).toBeNull()
  })
})

describe("scoreCardIsAbsentEvaluation", () => {
  it("treats a failed, non-errored, signal-less evaluation as absent", () => {
    expect(
      scoreCardIsAbsentEvaluation({ source: "evaluation", errored: false, passed: false, signalId: null }),
    ).toBe(true)
  })

  it("does not treat signaled failures, present, errored, or non-evaluation scores as absent", () => {
    expect(
      scoreCardIsAbsentEvaluation({
        source: "evaluation",
        errored: false,
        passed: false,
        signalId: "iiiiiiiiiiiiiiiiiiiiiiii",
      }),
    ).toBe(false)
    expect(
      scoreCardIsAbsentEvaluation({ source: "evaluation", errored: false, passed: true, signalId: null }),
    ).toBe(false)
    expect(
      scoreCardIsAbsentEvaluation({ source: "evaluation", errored: true, passed: false, signalId: null }),
    ).toBe(false)
    expect(
      scoreCardIsAbsentEvaluation({ source: "annotation", errored: false, passed: false, signalId: null }),
    ).toBe(false)
  })
})

describe("scoreCardShouldShowValue", () => {
  it("hides the 0% value on signal-less absent evaluation runs", () => {
    expect(
      scoreCardShouldShowValue({ source: "evaluation", errored: false, passed: false, signalId: null }),
    ).toBe(false)
    expect(
      scoreCardShouldShowValue({
        source: "evaluation",
        errored: false,
        passed: false,
        signalId: "iiiiiiiiiiiiiiiiiiiiiiii",
      }),
    ).toBe(true)
    expect(
      scoreCardShouldShowValue({ source: "evaluation", errored: false, passed: true, signalId: null }),
    ).toBe(true)
    expect(scoreCardShouldShowValue({ source: "custom", errored: false, passed: false, signalId: null })).toBe(true)
  })
})

describe("scoreCardShouldShowFeedback", () => {
  it("hides feedback on signal-less absent evaluations", () => {
    expect(
      scoreCardShouldShowFeedback({
        source: "evaluation",
        errored: false,
        passed: false,
        signalId: null,
        feedback: "No condition matched",
      }),
    ).toBe(false)
    expect(
      scoreCardShouldShowFeedback({
        source: "evaluation",
        errored: false,
        passed: false,
        signalId: null,
        feedback: "No tool call named search",
      }),
    ).toBe(false)
  })

  it("keeps feedback on signaled failures, present evaluations, and other sources", () => {
    expect(
      scoreCardShouldShowFeedback({
        source: "evaluation",
        errored: false,
        passed: false,
        signalId: "iiiiiiiiiiiiiiiiiiiiiiii",
        feedback: "Detector fired with a low score",
      }),
    ).toBe(true)
    expect(
      scoreCardShouldShowFeedback({
        source: "evaluation",
        errored: false,
        passed: true,
        signalId: null,
        feedback: "Tool call named search",
      }),
    ).toBe(true)
    expect(
      scoreCardShouldShowFeedback({
        source: "annotation",
        errored: false,
        passed: false,
        signalId: null,
        feedback: "Needs a better answer",
      }),
    ).toBe(true)
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

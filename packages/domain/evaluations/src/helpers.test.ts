import { describe, expect, it } from "vitest"
import { wrapPromptAsScript } from "./baseline-generation.ts"
import { type ConfusionMatrix, evaluationSchema } from "./entities/evaluation.ts"
import { EvaluationDeletedError } from "./errors.ts"
import {
  addConfusionMatrixObservation,
  applyIssueIgnoreToEvaluation,
  applyIssueResolutionToEvaluation,
  archiveEvaluation,
  calculateAccuracy,
  calculateF1,
  calculateMatthewsCorrelationCoefficient,
  calculateMatthewsCorrelationCoefficientDrop,
  calculatePrecision,
  calculateRecall,
  decideAlignmentRefreshStrategy,
  deriveConfusionMatrix,
  deriveEvaluationAlignmentMetrics,
  emptyConfusionMatrix,
  evaluationAlignmentJobStatusKey,
  hasMatthewsCorrelationCoefficientDropExceededTolerance,
  isArchivedEvaluation,
  isDeletedEvaluation,
  mergeConfusionMatrices,
  softDeleteEvaluation,
  totalConfusionMatrixObservations,
  unarchiveEvaluation,
} from "./helpers.ts"

const makeEvaluation = (overrides: Partial<ReturnType<typeof evaluationSchema.parse>> = {}) =>
  evaluationSchema.parse({
    id: "e".repeat(24),
    organizationId: "o".repeat(24),
    projectId: "p".repeat(24),
    issueId: "i".repeat(24),
    name: "Secret Leakage Monitor",
    description: "Detects when the agent leaks secrets.",
    script: wrapPromptAsScript("Check for secret leakage in the conversation."),
    trigger: {
      filter: {},
      turn: "every",
      debounce: 0,
      sampling: 10,
    },
    alignment: {
      evaluationHash: "hash-1",
      confusionMatrix: {
        truePositives: 12,
        falsePositives: 2,
        falseNegatives: 1,
        trueNegatives: 35,
      },
    },
    alignedAt: new Date("2026-04-01T00:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides,
  })

describe("evaluation lifecycle helpers", () => {
  it("archives an active evaluation", () => {
    const archivedAt = new Date("2026-04-02T00:00:00.000Z")
    const archived = archiveEvaluation({
      evaluation: makeEvaluation(),
      archivedAt,
    })

    expect(archived.archivedAt).toEqual(archivedAt)
    expect(archived.updatedAt).toEqual(archivedAt)
    expect(isArchivedEvaluation(archived)).toBe(true)
  })

  it("unarchives an archived evaluation", () => {
    const unarchivedAt = new Date("2026-04-03T00:00:00.000Z")
    const unarchived = unarchiveEvaluation({
      evaluation: makeEvaluation({
        archivedAt: new Date("2026-04-02T00:00:00.000Z"),
      }),
      updatedAt: unarchivedAt,
    })

    expect(unarchived.archivedAt).toBeNull()
    expect(unarchived.updatedAt).toEqual(unarchivedAt)
  })

  it("soft deletes an evaluation", () => {
    const deletedAt = new Date("2026-04-04T00:00:00.000Z")
    const deleted = softDeleteEvaluation({
      evaluation: makeEvaluation(),
      deletedAt,
    })

    expect(deleted.deletedAt).toEqual(deletedAt)
    expect(deleted.updatedAt).toEqual(deletedAt)
    expect(isDeletedEvaluation(deleted)).toBe(true)
  })

  it("applies keepMonitoring=true by leaving the evaluation active", () => {
    const evaluation = makeEvaluation()

    expect(
      applyIssueResolutionToEvaluation({
        evaluation,
        keepMonitoring: true,
      }),
    ).toEqual(evaluation)
  })

  it("applies keepMonitoring=false by archiving the evaluation", () => {
    const archivedAt = new Date("2026-04-05T00:00:00.000Z")
    const archived = applyIssueResolutionToEvaluation({
      evaluation: makeEvaluation(),
      keepMonitoring: false,
      archivedAt,
    })

    expect(archived.archivedAt).toEqual(archivedAt)
    expect(isArchivedEvaluation(archived)).toBe(true)
  })

  it("archives linked evaluations when an issue is ignored", () => {
    const archivedAt = new Date("2026-04-06T00:00:00.000Z")
    const archived = applyIssueIgnoreToEvaluation({
      evaluation: makeEvaluation(),
      archivedAt,
    })

    expect(archived.archivedAt).toEqual(archivedAt)
  })

  it("rejects direct archive and unarchive operations for deleted evaluations", () => {
    const deleted = makeEvaluation({
      deletedAt: new Date("2026-04-04T00:00:00.000Z"),
    })

    expect(() => archiveEvaluation({ evaluation: deleted })).toThrowError(EvaluationDeletedError)
    expect(() => unarchiveEvaluation({ evaluation: deleted })).toThrowError(EvaluationDeletedError)
  })
})

describe("confusion-matrix metric helpers", () => {
  const confusionMatrix: ConfusionMatrix = {
    truePositives: 12,
    falsePositives: 2,
    falseNegatives: 1,
    trueNegatives: 35,
  }

  it("derives the expected metrics from a non-empty confusion matrix", () => {
    expect(totalConfusionMatrixObservations(confusionMatrix)).toBe(50)
    expect(calculateAccuracy(confusionMatrix)).toBeCloseTo(0.94)
    expect(calculatePrecision(confusionMatrix)).toBeCloseTo(12 / 14)
    expect(calculateRecall(confusionMatrix)).toBeCloseTo(12 / 13)
    expect(calculateF1(confusionMatrix)).toBeCloseTo(24 / 27)
    expect(calculateMatthewsCorrelationCoefficient(confusionMatrix)).toBeCloseTo(0.8488746876)

    expect(deriveEvaluationAlignmentMetrics(confusionMatrix)).toEqual({
      accuracy: calculateAccuracy(confusionMatrix),
      precision: calculatePrecision(confusionMatrix),
      recall: calculateRecall(confusionMatrix),
      f1: calculateF1(confusionMatrix),
      matthewsCorrelationCoefficient: calculateMatthewsCorrelationCoefficient(confusionMatrix),
    })
  })

  it("returns zero when a metric denominator is empty", () => {
    const empty: ConfusionMatrix = {
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      trueNegatives: 0,
    }

    expect(totalConfusionMatrixObservations(empty)).toBe(0)
    expect(calculateAccuracy(empty)).toBe(0)
    expect(calculatePrecision(empty)).toBe(0)
    expect(calculateRecall(empty)).toBe(0)
    expect(calculateF1(empty)).toBe(0)
    expect(calculateMatthewsCorrelationCoefficient(empty)).toBe(0)
  })

  it("derives confusion-matrix counters from labeled observations", () => {
    const derived = deriveConfusionMatrix([
      { expectedPositive: true, predictedPositive: true },
      { expectedPositive: false, predictedPositive: true },
      { expectedPositive: true, predictedPositive: false },
      { expectedPositive: false, predictedPositive: false },
      { expectedPositive: false, predictedPositive: false },
    ])

    expect(derived).toEqual({
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 1,
      trueNegatives: 2,
    })
  })

  it("adds one observation to an existing confusion matrix", () => {
    expect(
      addConfusionMatrixObservation(emptyConfusionMatrix(), {
        expectedPositive: true,
        predictedPositive: false,
      }),
    ).toEqual({
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 1,
      trueNegatives: 0,
    })
  })

  it("merges a new confusion-matrix slice into the persisted counters", () => {
    expect(
      mergeConfusionMatrices(
        {
          truePositives: 12,
          falsePositives: 2,
          falseNegatives: 1,
          trueNegatives: 35,
        },
        {
          truePositives: 3,
          falsePositives: 1,
          falseNegatives: 2,
          trueNegatives: 4,
        },
      ),
    ).toEqual({
      truePositives: 15,
      falsePositives: 3,
      falseNegatives: 3,
      trueNegatives: 39,
    })
  })

  it("keeps metric-only refreshes when MCC stays within tolerance", () => {
    const decision = decideAlignmentRefreshStrategy({
      previousConfusionMatrix: {
        truePositives: 12,
        falsePositives: 2,
        falseNegatives: 1,
        trueNegatives: 35,
      },
      incrementalConfusionMatrix: {
        truePositives: 2,
        falsePositives: 0,
        falseNegatives: 0,
        trueNegatives: 3,
      },
    })

    expect(decision.strategy).toBe("metric-only")
    expect(decision.nextConfusionMatrix).toEqual({
      truePositives: 14,
      falsePositives: 2,
      falseNegatives: 1,
      trueNegatives: 38,
    })
    expect(decision.matthewsCorrelationCoefficientDrop).toBeLessThanOrEqual(0.05)
    expect(
      hasMatthewsCorrelationCoefficientDropExceededTolerance({
        previousConfusionMatrix: {
          truePositives: 12,
          falsePositives: 2,
          falseNegatives: 1,
          trueNegatives: 35,
        },
        nextConfusionMatrix: decision.nextConfusionMatrix,
      }),
    ).toBe(false)
  })

  it("escalates to full re-optimization when MCC drops past tolerance", () => {
    const previousConfusionMatrix = {
      truePositives: 12,
      falsePositives: 2,
      falseNegatives: 1,
      trueNegatives: 35,
    } satisfies ConfusionMatrix
    const decision = decideAlignmentRefreshStrategy({
      previousConfusionMatrix,
      incrementalConfusionMatrix: {
        truePositives: 0,
        falsePositives: 6,
        falseNegatives: 4,
        trueNegatives: 0,
      },
    })

    expect(decision.strategy).toBe("full-reoptimization")
    expect(
      calculateMatthewsCorrelationCoefficientDrop({
        previousConfusionMatrix,
        nextConfusionMatrix: decision.nextConfusionMatrix,
      }),
    ).toBeCloseTo(decision.matthewsCorrelationCoefficientDrop)
    expect(
      hasMatthewsCorrelationCoefficientDropExceededTolerance({
        previousConfusionMatrix,
        nextConfusionMatrix: decision.nextConfusionMatrix,
      }),
    ).toBe(true)
  })
})

describe("evaluationAlignmentJobStatusKey", () => {
  it("uses the canonical Redis key prefix", () => {
    expect(evaluationAlignmentJobStatusKey("job-123")).toBe("evaluation-alignment:job-123")
  })
})

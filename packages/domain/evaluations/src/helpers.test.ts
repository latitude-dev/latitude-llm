import { describe, expect, it } from "vitest"
import { type ConfusionMatrix, evaluationSchema, evaluationTriggerSchema } from "./entities/evaluation.ts"
import { EvaluationDeletedError } from "./errors.ts"
import {
  addConfusionMatrixObservation,
  applyIssueIgnoreToEvaluation,
  applyIssueResolutionToEvaluation,
  archiveEvaluation,
  buildLiveEvaluationExecuteScopeDedupeKey,
  buildLiveEvaluationExecuteTraceDedupeKey,
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
  getLiveEvaluationEligibility,
  getLiveEvaluationTurnScope,
  hasMatthewsCorrelationCoefficientDropExceededTolerance,
  isArchivedEvaluation,
  isDeletedEvaluation,
  mergeConfusionMatrices,
  shouldSampleLiveEvaluation,
  softDeleteEvaluation,
  toLiveEvaluationDebounceMs,
  totalConfusionMatrixObservations,
  unarchiveEvaluation,
} from "./helpers.ts"
import { wrapPromptAsEvaluationScript } from "./runtime/evaluation-execution.ts"

const makeEvaluation = (overrides: Partial<ReturnType<typeof evaluationSchema.parse>> = {}) =>
  evaluationSchema.parse({
    id: "e".repeat(24),
    organizationId: "o".repeat(24),
    projectId: "p".repeat(24),
    issueId: "i".repeat(24),
    name: "Secret Leakage Monitor",
    description: "Detects when the agent leaks secrets.",
    script: wrapPromptAsEvaluationScript("Check for secret leakage in the conversation."),
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

describe("live evaluation trigger helpers", () => {
  it("requires a positive debounce for last-turn evaluations", () => {
    const result = evaluationTriggerSchema.safeParse({
      filter: {},
      turn: "last",
      debounce: 0,
      sampling: 10,
    })

    expect(result.success).toBe(false)
    if (result.success) {
      throw new Error("Expected `turn = last` with `debounce = 0` to be rejected")
    }

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "`turn = last` requires `debounce > 0`",
          path: ["debounce"],
        }),
      ]),
    )
  })

  it("marks an active non-paused evaluation as eligible for live execution", () => {
    expect(getLiveEvaluationEligibility(makeEvaluation())).toEqual({ eligible: true })
  })

  it("rejects paused evaluations from live execution", () => {
    expect(
      getLiveEvaluationEligibility(
        makeEvaluation({
          trigger: {
            filter: {},
            turn: "every",
            debounce: 0,
            sampling: 0,
          },
        }),
      ),
    ).toEqual({
      eligible: false,
      reason: "paused",
    })
  })

  it("rejects archived evaluations from live execution", () => {
    expect(
      getLiveEvaluationEligibility(
        makeEvaluation({
          archivedAt: new Date("2026-04-02T00:00:00.000Z"),
        }),
      ),
    ).toEqual({
      eligible: false,
      reason: "archived",
    })
  })

  it("rejects deleted evaluations from live execution", () => {
    expect(
      getLiveEvaluationEligibility(
        makeEvaluation({
          deletedAt: new Date("2026-04-03T00:00:00.000Z"),
        }),
      ),
    ).toEqual({
      eligible: false,
      reason: "deleted",
    })
  })

  it("derives trace scope when no session is present", () => {
    expect(
      getLiveEvaluationTurnScope({
        traceId: "t".repeat(32),
      }),
    ).toEqual({
      kind: "trace",
      key: `trace:${"t".repeat(32)}`,
      traceId: "t".repeat(32),
      sessionId: null,
    })
  })

  it("derives session scope when a session is present", () => {
    expect(
      getLiveEvaluationTurnScope({
        traceId: "t".repeat(32),
        sessionId: "session-123",
      }),
    ).toEqual({
      kind: "session",
      key: "session:session-123",
      traceId: "t".repeat(32),
      sessionId: "session-123",
    })
  })

  it("builds a trace-scoped execute dedupe key", () => {
    expect(
      buildLiveEvaluationExecuteTraceDedupeKey({
        organizationId: "org-1",
        projectId: "proj-1",
        evaluationId: "eval-1",
        traceId: "trace-1",
      }),
    ).toBe("evaluations:live:execute:org-1:proj-1:eval-1:trace:trace-1")
  })

  it("builds a scope-scoped execute dedupe key using session scope when present", () => {
    expect(
      buildLiveEvaluationExecuteScopeDedupeKey({
        organizationId: "org-1",
        projectId: "proj-1",
        evaluationId: "eval-1",
        traceId: "trace-1",
        sessionId: "session-1",
      }),
    ).toBe("evaluations:live:execute:org-1:proj-1:eval-1:session:session-1")
  })

  it("builds a scope-scoped execute dedupe key using trace scope when no session is present", () => {
    expect(
      buildLiveEvaluationExecuteScopeDedupeKey({
        organizationId: "org-1",
        projectId: "proj-1",
        evaluationId: "eval-1",
        traceId: "trace-1",
      }),
    ).toBe("evaluations:live:execute:org-1:proj-1:eval-1:trace:trace-1")
  })

  it("converts debounce seconds into milliseconds", () => {
    expect(toLiveEvaluationDebounceMs(0)).toBeUndefined()
    expect(toLiveEvaluationDebounceMs(15)).toBe(15_000)
  })

  it("returns deterministic sampling decisions for the same evaluation input", async () => {
    const input = {
      organizationId: "org-1",
      projectId: "proj-1",
      evaluationId: "eval-1",
      traceId: "trace-1",
      sampling: 37,
    } as const

    const first = await shouldSampleLiveEvaluation(input)
    const second = await shouldSampleLiveEvaluation(input)

    expect(first).toBe(second)
  })

  it("treats zero and full percentages as hard sampling boundaries", async () => {
    await expect(
      shouldSampleLiveEvaluation({
        organizationId: "org-1",
        projectId: "proj-1",
        evaluationId: "eval-1",
        traceId: "trace-1",
        sampling: 0,
      }),
    ).resolves.toBe(false)

    await expect(
      shouldSampleLiveEvaluation({
        organizationId: "org-1",
        projectId: "proj-1",
        evaluationId: "eval-1",
        traceId: "trace-1",
        sampling: 100,
      }),
    ).resolves.toBe(true)
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

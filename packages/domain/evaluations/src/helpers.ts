import { deterministicSampling, type ResolvedSettings } from "@domain/shared"
import { ALIGNMENT_METRIC_TOLERANCE } from "./constants.ts"
import type { ConfusionMatrix, Evaluation } from "./entities/evaluation.ts"
import { isPausedEvaluation } from "./entities/evaluation.ts"
import { EvaluationDeletedError } from "./errors.ts"
import type { PublishLiveEvaluationExecuteInput } from "./ports/live-evaluation-queue-publisher.ts"

export type EvaluationAlignmentMetrics = {
  readonly alignmentMetric: number
  readonly accuracy: number
  readonly precision: number
  readonly recall: number
  readonly specificity: number
  readonly trueness: number
  readonly f1: number
  readonly balancedAccuracy: number
  readonly matthewsCorrelationCoefficient: number
}

export type ConfusionMatrixObservation = {
  readonly expectedPositive: boolean
  readonly predictedPositive: boolean
}

type AlignmentRefreshStrategy = "metric-only" | "full-reoptimization"

type AlignmentRefreshDecision = {
  readonly strategy: AlignmentRefreshStrategy
  readonly nextConfusionMatrix: ConfusionMatrix
  readonly previousAlignmentMetric: number
  readonly nextAlignmentMetric: number
  readonly alignmentMetricDrop: number
}

type LiveEvaluationEligibility =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: "deleted" | "archived" | "paused" }

type LiveEvaluationTurnScope = {
  readonly kind: "trace" | "session"
  readonly key: string
  readonly traceId: string
  readonly sessionId: string | null
}

const LIVE_EVALUATION_EXECUTE_KEY_PREFIX = "evaluations:live:execute"

const safeDivide = (numerator: number, denominator: number): number => {
  if (denominator === 0) {
    return 0
  }

  return numerator / denominator
}

// For class-of-interest ratios (accuracy / precision / recall / specificity),
// an empty denominator means the dataset contained no examples of that class.
// Returning 0 misrepresents a flawless run on an unbalanced dataset (e.g. 3 TP
// with 0 actual negatives would show specificity = 0%). Treat the undefined
// ratio as vacuously correct (1) instead.
const vacuousRatio = (numerator: number, denominator: number): number => {
  if (denominator === 0) {
    return 1
  }

  return numerator / denominator
}

const assertEvaluationNotDeleted = (evaluation: Evaluation): void => {
  if (evaluation.deletedAt !== null) {
    throw new EvaluationDeletedError({ evaluationId: evaluation.id })
  }
}

export const isArchivedEvaluation = (evaluation: Pick<Evaluation, "archivedAt" | "deletedAt">): boolean =>
  evaluation.archivedAt !== null && evaluation.deletedAt === null

export const isDeletedEvaluation = (evaluation: Pick<Evaluation, "deletedAt">): boolean => evaluation.deletedAt !== null

export const archiveEvaluation = (input: {
  readonly evaluation: Evaluation
  readonly archivedAt?: Date
}): Evaluation => {
  const archivedAt = input.archivedAt ?? new Date()
  assertEvaluationNotDeleted(input.evaluation)

  if (input.evaluation.archivedAt !== null) {
    return input.evaluation
  }

  return {
    ...input.evaluation,
    archivedAt,
    updatedAt: archivedAt,
  }
}

export const unarchiveEvaluation = (input: {
  readonly evaluation: Evaluation
  readonly updatedAt?: Date
}): Evaluation => {
  const updatedAt = input.updatedAt ?? new Date()
  assertEvaluationNotDeleted(input.evaluation)

  if (input.evaluation.archivedAt === null) {
    return input.evaluation
  }

  return {
    ...input.evaluation,
    archivedAt: null,
    updatedAt,
  }
}

export const softDeleteEvaluation = (input: {
  readonly evaluation: Evaluation
  readonly deletedAt?: Date
}): Evaluation => {
  const deletedAt = input.deletedAt ?? new Date()

  if (input.evaluation.deletedAt !== null) {
    return input.evaluation
  }

  return {
    ...input.evaluation,
    deletedAt,
    updatedAt: deletedAt,
  }
}

export const applyIssueResolutionToEvaluation = (input: {
  readonly evaluation: Evaluation
  readonly keepMonitoring: ResolvedSettings["keepMonitoring"]
  readonly deletedAt?: Date
}): Evaluation => {
  if (isDeletedEvaluation(input.evaluation)) {
    return input.evaluation
  }

  if (input.keepMonitoring) {
    return input.evaluation
  }

  // Temporary until the evaluations dashboard exists: issue-driven "stop monitoring"
  // transitions soft delete the linked evaluation instead of archiving it into a
  // read-only dashboard that users cannot access yet.
  return softDeleteEvaluation(
    input.deletedAt
      ? {
          evaluation: input.evaluation,
          deletedAt: input.deletedAt,
        }
      : {
          evaluation: input.evaluation,
        },
  )
}

export const applyIssueIgnoreToEvaluation = (input: {
  readonly evaluation: Evaluation
  readonly deletedAt?: Date
}): Evaluation => {
  if (isDeletedEvaluation(input.evaluation)) {
    return input.evaluation
  }

  // Temporary until the evaluations dashboard exists: issue-driven "stop monitoring"
  // transitions soft delete the linked evaluation instead of archiving it into a
  // read-only dashboard that users cannot access yet.
  return softDeleteEvaluation(
    input.deletedAt
      ? {
          evaluation: input.evaluation,
          deletedAt: input.deletedAt,
        }
      : {
          evaluation: input.evaluation,
        },
  )
}

export const getLiveEvaluationEligibility = (
  evaluation: Pick<Evaluation, "archivedAt" | "deletedAt" | "trigger">,
): LiveEvaluationEligibility => {
  if (isDeletedEvaluation(evaluation)) {
    return { eligible: false, reason: "deleted" }
  }

  if (isArchivedEvaluation(evaluation)) {
    return { eligible: false, reason: "archived" }
  }

  if (isPausedEvaluation(evaluation)) {
    return { eligible: false, reason: "paused" }
  }

  return { eligible: true }
}

export const getLiveEvaluationTurnScope = (input: {
  readonly traceId: string
  readonly sessionId?: string | null | undefined
}): LiveEvaluationTurnScope => {
  const sessionId = input.sessionId ?? null

  if (sessionId) {
    return {
      kind: "session",
      key: `session:${sessionId}`,
      traceId: input.traceId,
      sessionId,
    }
  }

  return {
    kind: "trace",
    key: `trace:${input.traceId}`,
    traceId: input.traceId,
    sessionId: null,
  }
}

export const shouldSampleLiveEvaluation = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly evaluationId: string
  readonly traceId: string
  readonly sampling: number
}): Promise<boolean> =>
  deterministicSampling({
    sampling: input.sampling,
    keyParts: [input.organizationId, input.projectId, input.evaluationId, input.traceId],
  })

export const buildLiveEvaluationExecuteTraceDedupeKey = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly evaluationId: string
  readonly traceId: string
}): string =>
  `${LIVE_EVALUATION_EXECUTE_KEY_PREFIX}:${input.organizationId}:${input.projectId}:${input.evaluationId}:trace:${input.traceId}`

export const buildLiveEvaluationExecuteScopeDedupeKey = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly evaluationId: string
  readonly traceId: string
  readonly sessionId?: string | null
}): string => {
  const scope = getLiveEvaluationTurnScope({
    traceId: input.traceId,
    sessionId: input.sessionId,
  })

  return `${LIVE_EVALUATION_EXECUTE_KEY_PREFIX}:${input.organizationId}:${input.projectId}:${input.evaluationId}:${scope.key}`
}

export const toLiveEvaluationDebounceMs = (debounceSeconds: number): number | undefined =>
  debounceSeconds > 0 ? debounceSeconds * 1000 : undefined

export const buildLiveEvaluationExecutePublication = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly sessionId?: string | null
  readonly evaluation: Evaluation
}): PublishLiveEvaluationExecuteInput => {
  const debounceMs = toLiveEvaluationDebounceMs(input.evaluation.trigger.debounce)
  const traceDedupeKey = buildLiveEvaluationExecuteTraceDedupeKey({
    organizationId: input.organizationId,
    projectId: input.projectId,
    evaluationId: input.evaluation.id,
    traceId: input.traceId,
  })
  const scopeDedupeKey = buildLiveEvaluationExecuteScopeDedupeKey({
    organizationId: input.organizationId,
    projectId: input.projectId,
    evaluationId: input.evaluation.id,
    traceId: input.traceId,
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
  })

  if (input.evaluation.trigger.turn === "every" && debounceMs === undefined) {
    return {
      organizationId: input.organizationId,
      projectId: input.projectId,
      evaluationId: input.evaluation.id,
      traceId: input.traceId,
      dedupeKey: traceDedupeKey,
    }
  }

  if (input.evaluation.trigger.turn === "last") {
    if (debounceMs === undefined) {
      throw new Error("`turn = last` requires `debounce > 0` before enqueue publication")
    }

    // TODO(live-evals-last-trace): `turn = last` should identify the last trace in a
    // session, which needs a session-level signal separate from the current trace-end
    // debounce that only identifies the last span of one trace.
    return {
      organizationId: input.organizationId,
      projectId: input.projectId,
      evaluationId: input.evaluation.id,
      traceId: input.traceId,
      dedupeKey: scopeDedupeKey,
      debounceMs,
    }
  }

  if (input.evaluation.trigger.turn === "every" && debounceMs !== undefined) {
    return {
      organizationId: input.organizationId,
      projectId: input.projectId,
      evaluationId: input.evaluation.id,
      traceId: input.traceId,
      dedupeKey: scopeDedupeKey,
      debounceMs,
    }
  }

  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    evaluationId: input.evaluation.id,
    traceId: input.traceId,
    dedupeKey: traceDedupeKey,
    ...(debounceMs !== undefined ? { debounceMs } : {}),
  }
}

export const emptyConfusionMatrix = (): ConfusionMatrix => ({
  truePositives: 0,
  falsePositives: 0,
  falseNegatives: 0,
  trueNegatives: 0,
})

export const addConfusionMatrixObservation = (
  confusionMatrix: ConfusionMatrix,
  observation: ConfusionMatrixObservation,
): ConfusionMatrix => {
  if (observation.expectedPositive && observation.predictedPositive) {
    return {
      ...confusionMatrix,
      truePositives: confusionMatrix.truePositives + 1,
    }
  }

  if (!observation.expectedPositive && observation.predictedPositive) {
    return {
      ...confusionMatrix,
      falsePositives: confusionMatrix.falsePositives + 1,
    }
  }

  if (observation.expectedPositive && !observation.predictedPositive) {
    return {
      ...confusionMatrix,
      falseNegatives: confusionMatrix.falseNegatives + 1,
    }
  }

  return {
    ...confusionMatrix,
    trueNegatives: confusionMatrix.trueNegatives + 1,
  }
}

export const deriveConfusionMatrix = (observations: readonly ConfusionMatrixObservation[]): ConfusionMatrix =>
  observations.reduce(addConfusionMatrixObservation, emptyConfusionMatrix())

export const mergeConfusionMatrices = (left: ConfusionMatrix, right: ConfusionMatrix): ConfusionMatrix => ({
  truePositives: left.truePositives + right.truePositives,
  falsePositives: left.falsePositives + right.falsePositives,
  falseNegatives: left.falseNegatives + right.falseNegatives,
  trueNegatives: left.trueNegatives + right.trueNegatives,
})

export const totalConfusionMatrixObservations = (confusionMatrix: ConfusionMatrix): number =>
  confusionMatrix.truePositives +
  confusionMatrix.falsePositives +
  confusionMatrix.falseNegatives +
  confusionMatrix.trueNegatives

export const calculateAccuracy = (confusionMatrix: ConfusionMatrix): number =>
  vacuousRatio(
    confusionMatrix.truePositives + confusionMatrix.trueNegatives,
    totalConfusionMatrixObservations(confusionMatrix),
  )

export const calculatePrecision = (confusionMatrix: ConfusionMatrix): number =>
  vacuousRatio(confusionMatrix.truePositives, confusionMatrix.truePositives + confusionMatrix.falsePositives)

export const calculateRecall = (confusionMatrix: ConfusionMatrix): number =>
  vacuousRatio(confusionMatrix.truePositives, confusionMatrix.truePositives + confusionMatrix.falseNegatives)

export const calculateSpecificity = (confusionMatrix: ConfusionMatrix): number =>
  vacuousRatio(confusionMatrix.trueNegatives, confusionMatrix.trueNegatives + confusionMatrix.falsePositives)

export const calculateTrueness = (confusionMatrix: ConfusionMatrix): number =>
  vacuousRatio(confusionMatrix.trueNegatives, confusionMatrix.trueNegatives + confusionMatrix.falseNegatives)

export const calculateF1 = (confusionMatrix: ConfusionMatrix): number =>
  vacuousRatio(
    2 * confusionMatrix.truePositives,
    2 * confusionMatrix.truePositives + confusionMatrix.falsePositives + confusionMatrix.falseNegatives,
  )

export const calculateBalancedAccuracy = (confusionMatrix: ConfusionMatrix): number =>
  (calculateRecall(confusionMatrix) + calculateSpecificity(confusionMatrix)) / 2

export const calculateMatthewsCorrelationCoefficient = (confusionMatrix: ConfusionMatrix): number => {
  const numerator =
    confusionMatrix.truePositives * confusionMatrix.trueNegatives -
    confusionMatrix.falsePositives * confusionMatrix.falseNegatives

  const denominator = Math.sqrt(
    (confusionMatrix.truePositives + confusionMatrix.falsePositives) *
      (confusionMatrix.truePositives + confusionMatrix.falseNegatives) *
      (confusionMatrix.trueNegatives + confusionMatrix.falsePositives) *
      (confusionMatrix.trueNegatives + confusionMatrix.falseNegatives),
  )

  return safeDivide(numerator, denominator)
}

// The alignment metric is the single headline score used to judge whether an
// evaluation is well aligned with human annotations. It is intentionally
// decoupled from the concrete formula so the rest of the codebase never hard
// codes "MCC" or "balanced accuracy" — swapping the formula only requires
// editing this function body.
export const calculateAlignmentMetric = (confusionMatrix: ConfusionMatrix): number =>
  calculateBalancedAccuracy(confusionMatrix)

export const deriveEvaluationAlignmentMetrics = (confusionMatrix: ConfusionMatrix): EvaluationAlignmentMetrics => ({
  alignmentMetric: calculateAlignmentMetric(confusionMatrix),
  accuracy: calculateAccuracy(confusionMatrix),
  precision: calculatePrecision(confusionMatrix),
  recall: calculateRecall(confusionMatrix),
  specificity: calculateSpecificity(confusionMatrix),
  trueness: calculateTrueness(confusionMatrix),
  f1: calculateF1(confusionMatrix),
  balancedAccuracy: calculateBalancedAccuracy(confusionMatrix),
  matthewsCorrelationCoefficient: calculateMatthewsCorrelationCoefficient(confusionMatrix),
})

export const calculateAlignmentMetricDrop = (input: {
  readonly previousConfusionMatrix: ConfusionMatrix
  readonly nextConfusionMatrix: ConfusionMatrix
}): number =>
  calculateAlignmentMetric(input.previousConfusionMatrix) - calculateAlignmentMetric(input.nextConfusionMatrix)

export const hasAlignmentMetricDropExceededTolerance = (input: {
  readonly previousConfusionMatrix: ConfusionMatrix
  readonly nextConfusionMatrix: ConfusionMatrix
  readonly tolerance?: number
}): boolean => calculateAlignmentMetricDrop(input) > (input.tolerance ?? ALIGNMENT_METRIC_TOLERANCE)

export const decideAlignmentRefreshStrategy = (input: {
  readonly previousConfusionMatrix: ConfusionMatrix
  readonly incrementalConfusionMatrix: ConfusionMatrix
  readonly tolerance?: number
}): AlignmentRefreshDecision => {
  const nextConfusionMatrix = mergeConfusionMatrices(input.previousConfusionMatrix, input.incrementalConfusionMatrix)
  const previousAlignmentMetric = calculateAlignmentMetric(input.previousConfusionMatrix)
  const nextAlignmentMetric = calculateAlignmentMetric(nextConfusionMatrix)
  const alignmentMetricDrop = previousAlignmentMetric - nextAlignmentMetric

  return {
    strategy:
      alignmentMetricDrop > (input.tolerance ?? ALIGNMENT_METRIC_TOLERANCE) ? "full-reoptimization" : "metric-only",
    nextConfusionMatrix,
    previousAlignmentMetric,
    nextAlignmentMetric,
    alignmentMetricDrop,
  }
}

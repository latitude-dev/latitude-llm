import { type formatGenAIConversation, formatGenAIMessage } from "@domain/ai"
import { BadRequestError, type ResolvedSettings } from "@domain/shared"
import type { EvaluationAlignmentConversationMessage } from "./alignment-types.ts"
import {
  ALIGNMENT_MCC_TOLERANCE,
  EVALUATION_ALIGNMENT_JOB_KEY_PREFIX,
  EVALUATION_NAME_MAX_LENGTH,
} from "./constants.ts"
import type {
  ConfusionMatrix,
  Evaluation,
  EvaluationAlignmentJobError,
  EvaluationAlignmentJobStatus,
} from "./entities/evaluation.ts"
import { evaluationAlignmentJobStatusSchema } from "./entities/evaluation.ts"
import { EvaluationDeletedError } from "./errors.ts"

export type EvaluationAlignmentMetrics = {
  readonly accuracy: number
  readonly precision: number
  readonly recall: number
  readonly f1: number
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
  readonly previousMatthewsCorrelationCoefficient: number
  readonly nextMatthewsCorrelationCoefficient: number
  readonly matthewsCorrelationCoefficientDrop: number
}

const safeDivide = (numerator: number, denominator: number): number => {
  if (denominator === 0) {
    return 0
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
  readonly archivedAt?: Date
}): Evaluation => {
  if (isDeletedEvaluation(input.evaluation)) {
    return input.evaluation
  }

  if (input.keepMonitoring) {
    return input.evaluation
  }

  return archiveEvaluation(
    input.archivedAt
      ? {
          evaluation: input.evaluation,
          archivedAt: input.archivedAt,
        }
      : {
          evaluation: input.evaluation,
        },
  )
}

export const applyIssueIgnoreToEvaluation = (input: {
  readonly evaluation: Evaluation
  readonly archivedAt?: Date
}): Evaluation => {
  if (isDeletedEvaluation(input.evaluation)) {
    return input.evaluation
  }

  return archiveEvaluation(
    input.archivedAt
      ? {
          evaluation: input.evaluation,
          archivedAt: input.archivedAt,
        }
      : {
          evaluation: input.evaluation,
        },
  )
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
  safeDivide(
    confusionMatrix.truePositives + confusionMatrix.trueNegatives,
    totalConfusionMatrixObservations(confusionMatrix),
  )

export const calculatePrecision = (confusionMatrix: ConfusionMatrix): number =>
  safeDivide(confusionMatrix.truePositives, confusionMatrix.truePositives + confusionMatrix.falsePositives)

export const calculateRecall = (confusionMatrix: ConfusionMatrix): number =>
  safeDivide(confusionMatrix.truePositives, confusionMatrix.truePositives + confusionMatrix.falseNegatives)

export const calculateF1 = (confusionMatrix: ConfusionMatrix): number =>
  safeDivide(
    2 * confusionMatrix.truePositives,
    2 * confusionMatrix.truePositives + confusionMatrix.falsePositives + confusionMatrix.falseNegatives,
  )

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

export const deriveEvaluationAlignmentMetrics = (confusionMatrix: ConfusionMatrix): EvaluationAlignmentMetrics => ({
  accuracy: calculateAccuracy(confusionMatrix),
  precision: calculatePrecision(confusionMatrix),
  recall: calculateRecall(confusionMatrix),
  f1: calculateF1(confusionMatrix),
  matthewsCorrelationCoefficient: calculateMatthewsCorrelationCoefficient(confusionMatrix),
})

export const calculateMatthewsCorrelationCoefficientDrop = (input: {
  readonly previousConfusionMatrix: ConfusionMatrix
  readonly nextConfusionMatrix: ConfusionMatrix
}): number =>
  calculateMatthewsCorrelationCoefficient(input.previousConfusionMatrix) -
  calculateMatthewsCorrelationCoefficient(input.nextConfusionMatrix)

export const hasMatthewsCorrelationCoefficientDropExceededTolerance = (input: {
  readonly previousConfusionMatrix: ConfusionMatrix
  readonly nextConfusionMatrix: ConfusionMatrix
  readonly tolerance?: number
}): boolean => calculateMatthewsCorrelationCoefficientDrop(input) > (input.tolerance ?? ALIGNMENT_MCC_TOLERANCE)

export const decideAlignmentRefreshStrategy = (input: {
  readonly previousConfusionMatrix: ConfusionMatrix
  readonly incrementalConfusionMatrix: ConfusionMatrix
  readonly tolerance?: number
}): AlignmentRefreshDecision => {
  const nextConfusionMatrix = mergeConfusionMatrices(input.previousConfusionMatrix, input.incrementalConfusionMatrix)
  const previousMatthewsCorrelationCoefficient = calculateMatthewsCorrelationCoefficient(input.previousConfusionMatrix)
  const nextMatthewsCorrelationCoefficient = calculateMatthewsCorrelationCoefficient(nextConfusionMatrix)
  const matthewsCorrelationCoefficientDrop = previousMatthewsCorrelationCoefficient - nextMatthewsCorrelationCoefficient

  return {
    strategy:
      matthewsCorrelationCoefficientDrop > (input.tolerance ?? ALIGNMENT_MCC_TOLERANCE)
        ? "full-reoptimization"
        : "metric-only",
    nextConfusionMatrix,
    previousMatthewsCorrelationCoefficient,
    nextMatthewsCorrelationCoefficient,
    matthewsCorrelationCoefficientDrop,
  }
}

export const evaluationAlignmentJobStatusKey = (jobId: string): string =>
  `${EVALUATION_ALIGNMENT_JOB_KEY_PREFIX}:${jobId}`

export const parseStoredEvaluationAlignmentJobStatus = (value: string | null): EvaluationAlignmentJobStatus | null => {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as {
      readonly createdAt?: string
      readonly updatedAt?: string
      readonly [key: string]: unknown
    }

    if (typeof parsed.createdAt !== "string" || typeof parsed.updatedAt !== "string") {
      return null
    }

    return evaluationAlignmentJobStatusSchema.parse({
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      updatedAt: new Date(parsed.updatedAt),
    })
  } catch {
    return null
  }
}

export const buildEvaluationAlignmentJobStatus = (input: {
  readonly existingStatus: EvaluationAlignmentJobStatus | null
  readonly jobId: string
  readonly status: EvaluationAlignmentJobStatus["status"]
  readonly evaluationId: string | null | undefined
  readonly error: EvaluationAlignmentJobError | null | undefined
}): EvaluationAlignmentJobStatus => {
  const now = new Date()
  const base = {
    jobId: input.jobId,
    createdAt: input.existingStatus?.createdAt ?? now,
    updatedAt: now,
  }

  switch (input.status) {
    case "pending":
      return evaluationAlignmentJobStatusSchema.parse({
        ...base,
        status: "pending",
        evaluationId: null,
        error: null,
      })
    case "running":
      return evaluationAlignmentJobStatusSchema.parse({
        ...base,
        status: "running",
        evaluationId: input.evaluationId ?? null,
        error: null,
      })
    case "completed":
      if (!input.evaluationId) {
        throw new BadRequestError({
          message: "Completed evaluation-alignment status requires an evaluationId",
        })
      }

      return evaluationAlignmentJobStatusSchema.parse({
        ...base,
        status: "completed",
        evaluationId: input.evaluationId,
        error: null,
      })
    case "failed":
      return evaluationAlignmentJobStatusSchema.parse({
        ...base,
        status: "failed",
        evaluationId: input.evaluationId ?? null,
        error: input.error ?? { message: "Evaluation alignment failed" },
      })
  }
}

export const truncateEvaluationName = (value: string): string => value.slice(0, EVALUATION_NAME_MAX_LENGTH).trimEnd()

export const toAlignmentConversationMessages = (
  allMessages: Parameters<typeof formatGenAIConversation>[0],
): readonly EvaluationAlignmentConversationMessage[] =>
  allMessages.map((message) => ({
    role: message.role,
    content: formatGenAIMessage(message),
  }))

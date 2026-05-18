import { deriveEvaluationAlignmentMetrics, type Evaluation } from "@domain/evaluations"
import { cuidSchema } from "@domain/shared"
import { z } from "@hono/zod-openapi"

const AlignmentMetricsSchema = z
  .object({
    alignmentMetric: z
      .number()
      .describe("Headline score that judges how well the evaluation tracks human annotations."),
    accuracy: z.number().describe("Accuracy: `(TP + TN) / total`."),
    precision: z.number().describe("Precision: `TP / (TP + FP)`."),
    recall: z.number().describe("Recall / sensitivity: `TP / (TP + FN)`."),
    specificity: z.number().describe("Specificity: `TN / (TN + FP)`."),
    trueness: z.number().describe("Mean of precision and negative predictive value."),
    f1: z.number().describe("F1 score: harmonic mean of precision and recall."),
    balancedAccuracy: z.number().describe("Balanced accuracy: mean of recall and specificity."),
    matthewsCorrelationCoefficient: z.number().describe("Matthews correlation coefficient, in `[-1, 1]`."),
  })
  .openapi("EvaluationAlignmentMetrics")

export const EvaluationSchema = z
  .object({
    id: cuidSchema.describe("Stable evaluation identifier."),
    name: z.string().describe("Human-readable name."),
    description: z.string().describe("Generated description of the evaluation."),
    alignedAt: z.string().describe("ISO-8601 timestamp at which the evaluation was last realigned."),
    archivedAt: z.string().nullable().describe("ISO-8601 timestamp at which the evaluation was archived, or `null`."),
    deletedAt: z.string().nullable().describe("ISO-8601 timestamp at which the evaluation was deleted, or `null`."),
    createdAt: z.string().describe("ISO-8601 timestamp of creation."),
    updatedAt: z.string().describe("ISO-8601 timestamp of the last update."),
    sampling: z
      .number()
      .min(0)
      .max(100)
      .describe("Sampling rate as a percentage in `[0, 100]`. `0` means the evaluation is paused."),
    alignment: AlignmentMetricsSchema.describe("Alignment metrics computed from the evaluation's confusion matrix."),
  })
  .openapi("Evaluation")

export const toEvaluationResponse = (evaluation: Evaluation) => ({
  id: evaluation.id as string,
  name: evaluation.name,
  description: evaluation.description,
  alignedAt: evaluation.alignedAt.toISOString(),
  archivedAt: evaluation.archivedAt ? evaluation.archivedAt.toISOString() : null,
  deletedAt: evaluation.deletedAt ? evaluation.deletedAt.toISOString() : null,
  createdAt: evaluation.createdAt.toISOString(),
  updatedAt: evaluation.updatedAt.toISOString(),
  sampling: evaluation.trigger.sampling,
  alignment: deriveEvaluationAlignmentMetrics(evaluation.alignment.confusionMatrix),
})

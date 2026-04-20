import {
  type IssueId,
  type ProjectId,
  type RepositoryError,
  SessionId,
  scoreIdSchema,
  TraceId,
  type TraceId as TraceIdType,
} from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import { z } from "zod"
import { ALIGNMENT_CURATED_DATASET_MAX_ROWS } from "../constants.ts"

export const evaluationAlignmentExampleLabelSchema = z.enum(["positive", "negative"])
export type EvaluationAlignmentExampleLabel = z.infer<typeof evaluationAlignmentExampleLabelSchema>

export const evaluationAlignmentNegativePrioritySchema = z.enum([
  "passed-annotation-no-failures",
  "no-failed-scores",
  "unrelated-issue-scores",
])
export type EvaluationAlignmentNegativePriority = z.infer<typeof evaluationAlignmentNegativePrioritySchema>

export const evaluationAlignmentExampleSchema = z.object({
  traceId: z.string().min(1).transform(TraceId),
  sessionId: z.string().min(1).transform(SessionId).nullable(),
  scoreIds: z.array(scoreIdSchema).min(1),
  label: evaluationAlignmentExampleLabelSchema,
  negativePriority: evaluationAlignmentNegativePrioritySchema.nullable(),
  annotationFeedback: z.string().nullable(),
})
export type EvaluationAlignmentExample = z.infer<typeof evaluationAlignmentExampleSchema>

export interface ListEvaluationAlignmentExamplesInput {
  readonly projectId: ProjectId
  readonly issueId: IssueId
  readonly limit?: number
  readonly createdAfter?: Date
}

export interface ListNegativeEvaluationAlignmentExamplesInput extends ListEvaluationAlignmentExamplesInput {
  readonly excludeTraceIds?: readonly TraceIdType[]
}

export const DEFAULT_ALIGNMENT_EXAMPLE_LIMIT = ALIGNMENT_CURATED_DATASET_MAX_ROWS

export interface EvaluationAlignmentExamplesRepositoryShape {
  listPositiveExamples(
    input: ListEvaluationAlignmentExamplesInput,
  ): Effect.Effect<readonly EvaluationAlignmentExample[], RepositoryError>
  listNegativeExamples(
    input: ListNegativeEvaluationAlignmentExamplesInput,
  ): Effect.Effect<readonly EvaluationAlignmentExample[], RepositoryError>
}

export class EvaluationAlignmentExamplesRepository extends ServiceMap.Service<
  EvaluationAlignmentExamplesRepository,
  EvaluationAlignmentExamplesRepositoryShape
>()("@domain/evaluations/EvaluationAlignmentExamplesRepository") {}

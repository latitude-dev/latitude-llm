import { WorkflowStarter, type WorkflowStarterShape } from "@domain/queue"
import type { AnnotationScore, Score } from "@domain/scores"
import { ScoreRepository } from "@domain/scores"
import type { NotFoundError, RepositoryError, ScoreId } from "@domain/shared"
import { Effect } from "effect"

export interface PublishAnnotationInput {
  readonly scoreId: ScoreId
}

export type PublishAnnotationError = RepositoryError | NotFoundError

export type PublishAnnotationResult =
  | { readonly action: "already-published"; readonly score: AnnotationScore }
  | { readonly action: "not-human"; readonly score: Score }
  | { readonly action: "workflow-started"; readonly scoreId: ScoreId }

const startPublishAnnotationWorkflow = (
  workflowStarter: WorkflowStarterShape,
  input: { readonly organizationId: string; readonly projectId: string; readonly scoreId: ScoreId },
) =>
  workflowStarter.start(
    "publishAnnotationWorkflow",
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      scoreId: input.scoreId,
    },
    {
      workflowId: `annotations:publish:${input.scoreId}`,
    },
  )

export const publishHumanAnnotationUseCase = Effect.fn("annotations.publishHumanAnnotation")(function* (
  input: PublishAnnotationInput,
) {
  yield* Effect.annotateCurrentSpan("annotation.scoreId", input.scoreId)
  const workflowStarter = yield* WorkflowStarter
  const scoreRepository = yield* ScoreRepository
  const score = yield* scoreRepository.findById(input.scoreId)

  if (score.draftedAt === null) {
    return {
      action: "already-published",
      score: score as AnnotationScore,
    } satisfies PublishAnnotationResult
  }

  if (score.source !== "annotation") {
    return {
      action: "not-human",
      score,
    }
  }

  yield* startPublishAnnotationWorkflow(workflowStarter, {
    organizationId: score.organizationId,
    projectId: score.projectId,
    scoreId: score.id,
  })

  return {
    action: "workflow-started",
    scoreId: score.id,
  } satisfies PublishAnnotationResult
})

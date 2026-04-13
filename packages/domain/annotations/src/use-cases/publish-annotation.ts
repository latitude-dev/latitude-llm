import { WorkflowStarter, type WorkflowStarterShape } from "@domain/queue"
import type { AnnotationScore } from "@domain/scores"
import { ScoreRepository } from "@domain/scores"
import { BadRequestError, type RepositoryError, type ScoreId } from "@domain/shared"
import { Effect } from "effect"

export interface PublishAnnotationInput {
  readonly scoreId: ScoreId
}

export type PublishAnnotationError = RepositoryError | BadRequestError

export type PublishAnnotationResult =
  | { readonly action: "already-published"; readonly score: AnnotationScore }
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

export const publishHumanAnnotationUseCase = (input: PublishAnnotationInput) =>
  Effect.gen(function* () {
    const workflowStarter = yield* WorkflowStarter
    const scoreRepository = yield* ScoreRepository
    const score = yield* scoreRepository
      .findById(input.scoreId)
      .pipe(
        Effect.catchTag("NotFoundError", () =>
          Effect.fail(new BadRequestError({ message: `Score ${input.scoreId} not found` })),
        ),
      )

    if (score.draftedAt === null) {
      return {
        action: "already-published",
        score: score as AnnotationScore,
      } satisfies PublishAnnotationResult
    }

    if (score.source !== "annotation") {
      return yield* new BadRequestError({
        message: `Score ${input.scoreId} is not an annotation (source: ${score.source})`,
      })
    }

    if (score.annotatorId === null) {
      return {
        action: "not-human",
        score: score as AnnotationScore,
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

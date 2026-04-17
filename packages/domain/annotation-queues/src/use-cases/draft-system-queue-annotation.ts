import { BadRequestError, ProjectId, type RepositoryError } from "@domain/shared"
import type { TraceResourceOutlierReason } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"
import { type RunSystemQueueAnnotatorError, runSystemQueueAnnotatorUseCase } from "./run-system-queue-annotator.ts"
import { systemQueueAnnotateInputSchema } from "./system-queue-annotator-contracts.ts"

const formatValidationError = (error: z.ZodError): string => error.issues.map((issue) => issue.message).join(", ")

const parseOrBadRequest = <T>(schema: z.ZodType<T>, input: unknown, message: string) =>
  Effect.try({
    try: () => schema.parse(input),
    catch: (error: unknown) =>
      new BadRequestError({
        message: error instanceof z.ZodError ? formatValidationError(error) : message,
      }),
  })

export interface DraftSystemQueueAnnotationOutput {
  readonly queueId: string
  readonly traceId: string
  readonly feedback: string
  readonly traceCreatedAt: string
}

interface DraftSystemQueueAnnotationInput {
  readonly organizationId: string
  readonly projectId: string
  readonly queueSlug: string
  readonly traceId: string
  readonly matchReasons?: readonly TraceResourceOutlierReason[]
}

export type DraftSystemQueueAnnotationError = BadRequestError | RepositoryError | RunSystemQueueAnnotatorError

/**
 * Drafts a system queue annotation by running the annotator to generate feedback.
 * This is a non-transactional operation that only generates the feedback text.
 * The actual persistence is handled separately by persistSystemQueueAnnotationUseCase.
 *
 * This use case is idempotent - retrying with the same (queueId, traceId) will
 * regenerate the same feedback (or similar, since LLM output may vary slightly).
 */
export const draftSystemQueueAnnotationUseCase = Effect.fn("annotationQueues.draftSystemQueueAnnotation")(function* (input: DraftSystemQueueAnnotationInput) {
    yield* Effect.annotateCurrentSpan("queue.organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("queue.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("queue.traceId", input.traceId)
    yield* Effect.annotateCurrentSpan("queue.queueSlug", input.queueSlug)

    const parsedInput = yield* parseOrBadRequest(
      systemQueueAnnotateInputSchema,
      input,
      "Invalid system queue annotate input",
    )

    const projectId = ProjectId(parsedInput.projectId)

    const queueRepository = yield* AnnotationQueueRepository
    const queue = yield* queueRepository.findSystemQueueBySlugInProject({
      projectId,
      queueSlug: parsedInput.queueSlug,
    })

    if (!queue) {
      return yield* new BadRequestError({
        message: `System queue not found for slug: ${parsedInput.queueSlug}`,
      })
    }

    const queueId = queue.id

    const annotatorResult = yield* runSystemQueueAnnotatorUseCase({
      organizationId: parsedInput.organizationId,
      projectId: parsedInput.projectId,
      queueSlug: parsedInput.queueSlug,
      traceId: parsedInput.traceId,
      ...(input.matchReasons ? { matchReasons: input.matchReasons } : {}),
    })

    return {
      queueId,
      traceId: parsedInput.traceId,
      feedback: annotatorResult.feedback,
      traceCreatedAt: annotatorResult.traceCreatedAt,
  } as DraftSystemQueueAnnotationOutput
})

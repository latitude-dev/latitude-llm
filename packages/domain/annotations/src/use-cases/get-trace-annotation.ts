import { type AnnotationScore, ScoreRepository } from "@domain/scores"
import { NotFoundError, type ProjectId, ScoreId, type TraceId } from "@domain/shared"
import { Effect } from "effect"

export interface GetTraceAnnotationInput {
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly annotationId: string
}

/**
 * Returns one annotation by id, scoped to the caller's organization (via RLS),
 * the requested project, the requested trace, and `source === "annotation"`.
 * Any mismatch — non-existent id, cross-project, cross-trace, or non-annotation
 * source — collapses to {@link NotFoundError} so existence never leaks across
 * tenancy boundaries.
 */
export const getTraceAnnotationUseCase = Effect.fn("annotations.getTraceAnnotation")(function* (
  input: GetTraceAnnotationInput,
) {
  yield* Effect.annotateCurrentSpan("annotation.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("annotation.traceId", input.traceId)
  yield* Effect.annotateCurrentSpan("annotation.id", input.annotationId)

  const repo = yield* ScoreRepository
  const score = yield* repo
    .findById(ScoreId(input.annotationId))
    .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

  if (
    !score ||
    score.source !== "annotation" ||
    score.projectId !== input.projectId ||
    score.traceId !== input.traceId
  ) {
    return yield* new NotFoundError({ entity: "Annotation", id: input.annotationId })
  }
  return score as AnnotationScore
})

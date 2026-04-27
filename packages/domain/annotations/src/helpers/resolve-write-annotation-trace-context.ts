import type { AnnotationAnchor } from "@domain/scores"
import {
  BadRequestError,
  type ChSqlClient,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  type TraceId,
} from "@domain/shared"
import { resolveLastLlmCompletionSpanId, SpanRepository, TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { resolveAnnotationAnchorText } from "./resolve-annotation-anchor-text.ts"

/**
 * Loads trace (and optionally spans) for annotation writes: anchor validation, session/span resolution.
 * Fails if the trace is missing when required, or if span resolution is required but no LLM span exists.
 */
export const resolveWriteAnnotationTraceContext = (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  /** Plain string ids as validated by Zod (`sessionIdSchema` / `spanIdSchema`). */
  readonly sessionId: string | null
  readonly spanId: string | null
  readonly anchor: AnnotationAnchor | undefined
}): Effect.Effect<
  { readonly sessionId: string | null; readonly spanId: string | null },
  BadRequestError | RepositoryError,
  TraceRepository | SpanRepository | ChSqlClient
> =>
  Effect.gen(function* () {
    const needsSessionResolution = input.sessionId === null
    const needsSpanResolution = input.spanId === null
    const needsTraceForAnchor = input.anchor?.messageIndex !== undefined
    const mustLoadTrace = needsTraceForAnchor || needsSessionResolution || needsSpanResolution

    let sessionId = input.sessionId
    let spanId = input.spanId

    if (!mustLoadTrace) {
      return { sessionId, spanId }
    }

    const traceRepository = yield* TraceRepository
    const detail = yield* traceRepository
      .findByTraceId({
        organizationId: input.organizationId,
        projectId: input.projectId,
        traceId: input.traceId,
      })
      .pipe(
        Effect.catchTag("NotFoundError", () =>
          Effect.fail(new BadRequestError({ message: "Trace not found for annotation" })),
        ),
      )

    if (needsTraceForAnchor && input.anchor) {
      const resolved = resolveAnnotationAnchorText(detail.allMessages, input.anchor)
      if (resolved === undefined) {
        return yield* new BadRequestError({
          message: "Could not resolve annotation anchor text from trace messages",
        })
      }
    }

    if (needsSessionResolution) {
      sessionId = detail.sessionId
    }

    if (needsSpanResolution) {
      const spanRepository = yield* SpanRepository
      const spans = yield* spanRepository.listByTraceId({
        organizationId: input.organizationId,
        traceId: input.traceId,
      })
      const resolvedSpanId = resolveLastLlmCompletionSpanId(spans)
      if (resolvedSpanId) spanId = resolvedSpanId
    }

    return { sessionId, spanId }
  })

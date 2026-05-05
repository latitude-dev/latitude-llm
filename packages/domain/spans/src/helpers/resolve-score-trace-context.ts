import {
  BadRequestError,
  type ChSqlClient,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  type TraceId,
} from "@domain/shared"
import { Effect } from "effect"
import { SpanRepository } from "../ports/span-repository.ts"
import { TraceRepository } from "../ports/trace-repository.ts"
import { resolveLastLlmCompletionSpanId } from "./resolve-last-llm-completion-span.ts"

/**
 * Resolves session and span ids for a score that may or may not be tied to a
 * trace.
 *
 * - `traceId === null` → score is uninstrumented; return inputs unchanged.
 * - `traceId !== null` and either id is missing → load the trace once, lift
 *   `sessionId` from the trace, and pin `spanId` to the trace's last LLM
 *   completion span.
 *
 * Mirrors the session/span half of `resolveWriteAnnotationTraceContext`
 * without the anchor-text validation, so use cases that don't deal with
 * anchors (custom and evaluation scores) can share the resolver.
 */
export const resolveScoreTraceContext = (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceId: TraceId | null
  readonly sessionId: string | null
  readonly spanId: string | null
}): Effect.Effect<
  { readonly sessionId: string | null; readonly spanId: string | null },
  BadRequestError | RepositoryError,
  TraceRepository | SpanRepository | ChSqlClient
> =>
  Effect.gen(function* () {
    if (input.traceId === null) {
      return { sessionId: input.sessionId, spanId: input.spanId }
    }

    const needsSessionResolution = input.sessionId === null
    const needsSpanResolution = input.spanId === null

    if (!needsSessionResolution && !needsSpanResolution) {
      return { sessionId: input.sessionId, spanId: input.spanId }
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
          Effect.fail(new BadRequestError({ message: "Trace not found for score" })),
        ),
      )

    let sessionId = input.sessionId
    let spanId = input.spanId

    if (needsSessionResolution) sessionId = detail.sessionId

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

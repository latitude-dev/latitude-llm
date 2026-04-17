import { OrganizationId, ProjectId, type RepositoryError, TraceId } from "@domain/shared"
import { Effect } from "effect"

import type { TraceDetail } from "../entities/trace.ts"
import { TraceRepository } from "../ports/trace-repository.ts"

export type LoadTraceForTraceEndSkipped = {
  readonly kind: "skipped"
  readonly reason: "trace-not-found"
  readonly traceId: string
}

export type LoadTraceForTraceEndFound = {
  readonly kind: "found"
  readonly traceDetail: TraceDetail
}

export type LoadTraceForTraceEndResult = LoadTraceForTraceEndSkipped | LoadTraceForTraceEndFound

export const loadTraceForTraceEndUseCase = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
}): Effect.Effect<LoadTraceForTraceEndResult, RepositoryError, TraceRepository> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("traceId", input.traceId)

    const traceRepository = yield* TraceRepository
    const detail = yield* traceRepository
      .findByTraceId({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        traceId: TraceId(input.traceId),
      })
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (detail === null) {
      return {
        kind: "skipped",
        reason: "trace-not-found",
        traceId: input.traceId,
      } satisfies LoadTraceForTraceEndSkipped
    }

    return { kind: "found", traceDetail: detail } satisfies LoadTraceForTraceEndFound
  }).pipe(Effect.withSpan("spans.loadTraceForTraceEnd"))

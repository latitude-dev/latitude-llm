import { type ChSqlClient, OrganizationId, ProjectId, type RepositoryError, TraceId } from "@domain/shared"
import { Effect } from "effect"

import type { Trace } from "../entities/trace.ts"
import { TraceRepository } from "../ports/trace-repository.ts"

export type LoadTraceForTraceEndSkipped = {
  readonly kind: "skipped"
  readonly reason: "trace-not-found"
  readonly traceId: string
}

export type LoadTraceForTraceEndFound = {
  readonly kind: "found"
  readonly trace: Trace
}

export type LoadTraceForTraceEndResult = LoadTraceForTraceEndSkipped | LoadTraceForTraceEndFound

export const loadTraceForTraceEndUseCase = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
}): Effect.Effect<LoadTraceForTraceEndResult, RepositoryError, ChSqlClient | TraceRepository> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("traceId", input.traceId)

    const traceRepository = yield* TraceRepository
    // Use the summary lookup: trace-end orchestrates downstream work using
    // only trace-level metadata (projectId, sessionId, startTime, rootSpanName).
    // Pulling full conversation messages here OOMs ClickHouse on long traces
    // — see docs/adr/0002-trace-detail-messages-from-spans.md.
    const trace = yield* traceRepository
      .findSummaryByTraceId({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        traceId: TraceId(input.traceId),
      })
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (trace === null) {
      return {
        kind: "skipped",
        reason: "trace-not-found",
        traceId: input.traceId,
      } satisfies LoadTraceForTraceEndSkipped
    }

    return { kind: "found", trace } satisfies LoadTraceForTraceEndFound
  }).pipe(Effect.withSpan("spans.loadTraceForTraceEnd"))

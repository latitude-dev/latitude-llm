import { ScoreAnalyticsRepository } from "@domain/scores"
import type { ChSqlClient, SignalId, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { Effect } from "effect"

export interface ListSignalTracesInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: SignalId
  /** Page size. Repository default applies when omitted. */
  readonly limit?: number
  /** Zero-based offset into the issue's distinct-trace list, ordered by `lastSeenAt` desc. */
  readonly offset?: number
}

export interface ListSignalTracesResult {
  readonly items: readonly TraceDetail[]
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

export type ListSignalTracesError = RepositoryError

/**
 * Returns the page of distinct traces that contributed at least one occurrence
 * of `signalId`, ordered by most recent activity first. The pagination shape
 * mirrors the analytics repo's `listTracesBySignal` — offset-based with
 * `hasMore` — and the trace payload is the same `TraceDetail` shape returned
 * by other trace endpoints, so callers can navigate directly to a single
 * trace without translating identifiers.
 */
export const listSignalTracesUseCase = (
  input: ListSignalTracesInput,
): Effect.Effect<
  ListSignalTracesResult,
  ListSignalTracesError,
  ChSqlClient | ScoreAnalyticsRepository | TraceRepository
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", String(input.projectId))
    yield* Effect.annotateCurrentSpan("signalId", String(input.signalId))

    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const traceRepository = yield* TraceRepository

    const tracePage = yield* scoreAnalyticsRepository.listTracesBySignal({
      organizationId: input.organizationId,
      projectId: input.projectId,
      signalId: input.signalId,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.offset !== undefined ? { offset: input.offset } : {}),
    })

    if (tracePage.items.length === 0) {
      return {
        items: [],
        hasMore: tracePage.hasMore,
        limit: tracePage.limit,
        offset: tracePage.offset,
      } satisfies ListSignalTracesResult
    }

    const traces = yield* traceRepository.listByTraceIds({
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceIds: tracePage.items.map((item) => item.traceId),
    })
    const traceById = new Map(traces.map((trace) => [trace.traceId, trace] as const))

    return {
      items: tracePage.items
        .map((item) => traceById.get(item.traceId))
        .filter((trace): trace is TraceDetail => trace !== undefined),
      hasMore: tracePage.hasMore,
      limit: tracePage.limit,
      offset: tracePage.offset,
    } satisfies ListSignalTracesResult
  }).pipe(Effect.withSpan("issues.listSignalTraces"))

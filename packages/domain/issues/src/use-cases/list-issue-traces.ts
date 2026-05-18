import { ScoreAnalyticsRepository } from "@domain/scores"
import type { ChSqlClient, IssueId, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { Effect } from "effect"

export interface ListIssueTracesInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly issueId: IssueId
  /** Page size. Repository default applies when omitted. */
  readonly limit?: number
  /** Zero-based offset into the issue's distinct-trace list, ordered by `lastSeenAt` desc. */
  readonly offset?: number
}

export interface ListIssueTracesResult {
  readonly items: readonly TraceDetail[]
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

export type ListIssueTracesError = RepositoryError

/**
 * Returns the page of distinct traces that contributed at least one occurrence
 * of `issueId`, ordered by most recent activity first. The pagination shape
 * mirrors the analytics repo's `listTracesByIssue` — offset-based with
 * `hasMore` — and the trace payload is the same `TraceDetail` shape returned
 * by other trace endpoints, so callers can navigate directly to a single
 * trace without translating identifiers.
 */
export const listIssueTracesUseCase = (
  input: ListIssueTracesInput,
): Effect.Effect<
  ListIssueTracesResult,
  ListIssueTracesError,
  ChSqlClient | ScoreAnalyticsRepository | TraceRepository
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", String(input.projectId))
    yield* Effect.annotateCurrentSpan("issueId", String(input.issueId))

    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const traceRepository = yield* TraceRepository

    const tracePage = yield* scoreAnalyticsRepository.listTracesByIssue({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.offset !== undefined ? { offset: input.offset } : {}),
    })

    if (tracePage.items.length === 0) {
      return {
        items: [],
        hasMore: tracePage.hasMore,
        limit: tracePage.limit,
        offset: tracePage.offset,
      } satisfies ListIssueTracesResult
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
    } satisfies ListIssueTracesResult
  }).pipe(Effect.withSpan("issues.listIssueTraces"))

import { filterSetSchema, OrganizationId, ProjectId } from "@domain/shared"
import type { Session, SessionDistinctColumn, SessionMetrics, SessionSearchMatch } from "@domain/spans"
import { SessionRepository } from "@domain/spans"
import { SessionRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient } from "../../server/clients.ts"

const serializeSession = (session: Session) => ({
  organizationId: session.organizationId,
  projectId: session.projectId,
  sessionId: session.sessionId,
  traceCount: session.traceCount,
  traceIds: session.traceIds,
  spanCount: session.spanCount,
  errorCount: session.errorCount,
  startTime: session.startTime.toISOString(),
  endTime: session.endTime.toISOString(),
  lastActivityTime: session.lastActivityTime.toISOString(),
  durationNs: session.durationNs,
  timeToFirstTokenNs: session.timeToFirstTokenNs,
  tokensInput: session.tokensInput,
  tokensOutput: session.tokensOutput,
  tokensCacheRead: session.tokensCacheRead,
  tokensCacheCreate: session.tokensCacheCreate,
  tokensReasoning: session.tokensReasoning,
  tokensTotal: session.tokensTotal,
  costInputMicrocents: session.costInputMicrocents,
  costOutputMicrocents: session.costOutputMicrocents,
  costTotalMicrocents: session.costTotalMicrocents,
  userId: session.userId,
  simulationId: session.simulationId,
  tags: session.tags,
  metadata: session.metadata,
  models: session.models,
  providers: session.providers,
  serviceNames: session.serviceNames,
  rootSpanId: session.rootSpanId,
  rootSpanName: session.rootSpanName,
})

export type SessionRecord = ReturnType<typeof serializeSession>

/**
 * Serializes a `SessionSearchMatch` for the wire. The shape is already
 * JSON-friendly (numbers + strings + arrays — no Date or branded types),
 * so this is effectively identity; the helper exists to mirror
 * `serializeSession` so the boundary stays explicit and any future field
 * additions to `SessionSearchMatch` get a single place to update.
 */
const serializeSearchMatch = (match: SessionSearchMatch) => ({
  bestScore: match.bestScore,
  bestTraceId: match.bestTraceId,
  matchingTraceCount: match.matchingTraceCount,
  matchingTraceIds: match.matchingTraceIds,
  matchingTraceScores: match.matchingTraceScores,
})

/**
 * Wire shape returned to clients for each entry in `searchMatches`. Exported
 * so PR 4's frontend hooks can type the React Query result without re-deriving
 * `ReturnType<typeof serializeSearchMatch>` at the call site.
 *
 * @public
 */
export type SessionSearchMatchRecord = ReturnType<typeof serializeSearchMatch>

const sessionListCursorSchema = z.object({
  sortValue: z.string(),
  sessionId: z.string(),
})

interface SessionListResult {
  readonly sessions: readonly SessionRecord[]
  readonly hasMore: boolean
  readonly nextCursor?: { readonly sortValue: string; readonly sessionId: string }
  /**
   * Per-result search match metadata, keyed by `sessionId`. Present only
   * when `searchQuery` was active for the request — degrades to `undefined`
   * for non-search list calls so existing consumers stay unaffected.
   */
  readonly searchMatches?: Readonly<Record<string, SessionSearchMatchRecord>>
}

/**
 * Ordering contract: when `searchQuery` is non-empty the server forces
 * ordering to `bestScore DESC, sessionId DESC` regardless of the client
 * `sortBy` / `sortDirection`. The actual enforcement lives in
 * `SessionRepository.listByProjectId` (PR 2 of LAT-599, spec §4.7); this
 * comment documents the contract for callers so they don't expect their
 * sort to take effect under search.
 */
export const listSessionsByProject = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      limit: z.number().optional(),
      cursor: sessionListCursorSchema.optional(),
      sortBy: z.string().optional(),
      sortDirection: z.enum(["asc", "desc"]).optional(),
      filters: filterSetSchema.optional(),
      searchQuery: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }): Promise<SessionListResult> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SessionRepository
        return yield* repo.listByProjectId({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          options: {
            limit: data.limit ?? 25,
            ...(data.cursor ? { cursor: data.cursor } : {}),
            ...(data.sortBy ? { sortBy: data.sortBy } : {}),
            ...(data.sortDirection ? { sortDirection: data.sortDirection } : {}),
            ...(data.filters ? { filters: data.filters } : {}),
            ...(data.searchQuery ? { searchQuery: data.searchQuery } : {}),
          },
        })
      }).pipe(withClickHouse(SessionRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )

    const searchMatches = page.searchMatches
      ? Object.fromEntries(
          Object.entries(page.searchMatches).map(([sessionId, match]) => [sessionId, serializeSearchMatch(match)]),
        )
      : undefined

    return {
      sessions: page.items.map(serializeSession),
      hasMore: page.hasMore,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      ...(searchMatches ? { searchMatches } : {}),
    }
  })

/**
 * Returns `{ totalCount, matchingTraceCount? }` for sessions in a project.
 * `matchingTraceCount` is populated only when `searchQuery` is non-empty
 * (spec §4.6) so the UI can render "N sessions · M matching turns".
 *
 * Consumed by PR 4's `useSessionsCount` hook on the search page; no direct
 * named import lands until then.
 *
 * @public
 */
export const countSessionsByProject = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      filters: filterSetSchema.optional(),
      searchQuery: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ readonly totalCount: number; readonly matchingTraceCount?: number }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SessionRepository
        return yield* repo.countByProjectId({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          ...(data.filters ? { filters: data.filters } : {}),
          ...(data.searchQuery ? { searchQuery: data.searchQuery } : {}),
        })
      }).pipe(withClickHouse(SessionRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )

    // `matchingTraceCount` is only populated when `searchQuery` was active
    // (spec §4.6); collapse the optional cleanly for the wire.
    return {
      totalCount: result.totalCount,
      ...(result.matchingTraceCount !== undefined ? { matchingTraceCount: result.matchingTraceCount } : {}),
    }
  })

export const getSessionMetricsByProject = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), filters: filterSetSchema.optional() }))
  .handler(async ({ data }): Promise<SessionMetrics | null> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SessionRepository
        return yield* repo.aggregateMetricsByProjectId({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          ...(data.filters ? { filters: data.filters } : {}),
        })
      }).pipe(withClickHouse(SessionRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

const DISTINCT_COLUMNS = ["tags", "models", "providers", "serviceNames"] as const

export const getSessionDistinctValues = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      column: z.enum(DISTINCT_COLUMNS),
      limit: z.number().optional(),
      search: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<readonly string[]> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SessionRepository
        return yield* repo.distinctFilterValues({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          column: data.column as SessionDistinctColumn,
          ...(data.limit !== undefined ? { limit: data.limit } : {}),
          ...(data.search ? { search: data.search } : {}),
        })
      }).pipe(withClickHouse(SessionRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

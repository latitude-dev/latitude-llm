import { ScoreAnalyticsRepository } from "@domain/scores"
import {
  type FilterSet,
  filterSetSchema,
  PERCENTILE_SESSION_FILTER_FIELDS,
  type PercentileSessionFilterField,
  ProjectId,
  SessionId,
  TaxonomyClusterId,
  TraceId,
} from "@domain/shared"
import { deriveSignalLifecycleStates, SignalRepository } from "@domain/signals"
import type {
  CohortSummary,
  Session,
  SessionDetail,
  SessionDistinctColumn,
  SessionMetrics,
  SessionSearchMatch,
  TraceDistribution,
  TraceTimeHistogramBucket,
} from "@domain/spans"
import {
  getSessionCohortSummaryUseCase,
  mergeTraceHistogramTimeFilters,
  SessionRepository,
  SpanRepository,
} from "@domain/spans"
import { TaxonomyClusterRepository } from "@domain/taxonomy"
import { AIEmbedLive, withAi } from "@platform/ai"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { ScoreAnalyticsRepositoryLive, SessionRepositoryLive, SpanRepositoryLive } from "@platform/db-clickhouse"
import { SignalRepositoryLive, TaxonomyClusterRepositoryLive } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { cacheHitRate } from "@repo/utils"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { z } from "zod"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../../server/clients.ts"
import type { ScopedOrgId } from "../../server/resolve-org-scope.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"
import { withScopedPostgres } from "../../server/scoped-postgres.ts"

export const serializeSession = (session: Session) => ({
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
  cacheHitRate: cacheHitRate({
    input: session.tokensInput,
    cacheRead: session.tokensCacheRead,
    cacheCreate: session.tokensCacheCreate,
  }),
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

const serializeSearchMatch = (match: SessionSearchMatch) => ({
  bestScore: match.bestScore,
  bestTraceId: match.bestTraceId,
  matchingTraceCount: match.matchingTraceCount,
  matchingTraceIds: match.matchingTraceIds,
  matchingTraceScores: match.matchingTraceScores,
})

export type SessionSearchMatchRecord = ReturnType<typeof serializeSearchMatch>

const sessionListCursorSchema = z.object({
  sortValue: z.string(),
  secondaryValue: z.string().optional(),
  sessionId: z.string(),
})

interface SessionListResult {
  readonly sessions: readonly SessionRecord[]
  readonly hasMore: boolean
  readonly nextCursor?: {
    readonly sortValue: string
    readonly secondaryValue?: string | undefined
    readonly sessionId: string
  }
  readonly searchMatches?: Readonly<Record<string, SessionSearchMatchRecord>>
}

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
  .handler(async ({ data, context }): Promise<SessionListResult> => {
    const orgId = await resolveOrgScope(context)
    const filters = await expandTopicFilters(orgId, ProjectId(data.projectId), data.filters)

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
            ...(filters ? { filters } : {}),
            ...(data.searchQuery ? { searchQuery: data.searchQuery } : {}),
          },
        })
      }).pipe(
        withScopedClickHouse(SessionRepositoryLive, getClickhouseClient(), orgId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
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

export const countSessionsByProject = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      filters: filterSetSchema.optional(),
      searchQuery: z.string().max(500).optional(),
    }),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      readonly totalCount: number
      readonly matchingTraceCount?: number
    }> => {
      const orgId = await resolveOrgScope(context)
      const filters = await expandTopicFilters(orgId, ProjectId(data.projectId), data.filters)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* SessionRepository
          return yield* repo.countByProjectId({
            organizationId: orgId,
            projectId: ProjectId(data.projectId),
            ...(filters ? { filters } : {}),
            ...(data.searchQuery ? { searchQuery: data.searchQuery } : {}),
          })
        }).pipe(
          withScopedClickHouse(SessionRepositoryLive, getClickhouseClient(), orgId),
          withAi(AIEmbedLive, getRedisClient()),
          withTracing,
        ),
      )

      return {
        totalCount: result.totalCount,
        ...(result.matchingTraceCount !== undefined ? { matchingTraceCount: result.matchingTraceCount } : {}),
      }
    },
  )

/**
 * Selecting a topic means its whole subtree: tree nodes hold residue
 * observations directly while descendants hold the rest, so the filter
 * expands each selected node into its subtree ids before ClickHouse sees it.
 */
const expandTopicFilters = async (
  orgId: ScopedOrgId,
  projectId: ProjectId,
  filters: FilterSet | undefined,
): Promise<FilterSet | undefined> => {
  const inCondition = filters?.topics?.find((condition) => condition.op === "in")
  const selected = Array.isArray(inCondition?.value) ? inCondition.value.map(String) : []
  if (!filters || selected.length === 0) return filters
  const expanded = await Effect.runPromise(
    Effect.gen(function* () {
      const clusters = yield* TaxonomyClusterRepository
      const ids = new Set<string>()
      for (const id of selected) {
        const subtree = yield* clusters.listSubtreeIds({ projectId, clusterId: TaxonomyClusterId(id) })
        for (const subtreeId of subtree) ids.add(subtreeId)
      }
      return [...ids]
    }).pipe(withScopedPostgres(TaxonomyClusterRepositoryLive, getPostgresClient(), orgId), withTracing),
  )
  // A selection that expands to nothing (e.g. a persisted filter pointing at
  // a since-merged cluster) must match ZERO sessions — an empty in-list would
  // collapse to "no filter" downstream and silently show the whole project.
  const NO_MATCH_CLUSTER_ID = "__no_matching_topic__"
  return { ...filters, topics: [{ op: "in", value: expanded.length > 0 ? expanded : [NO_MATCH_CLUSTER_ID] }] }
}

const sessionHistogramInputSchema = z.object({
  projectId: z.string(),
  filters: filterSetSchema.optional(),
  rangeStartIso: z.string(),
  rangeEndIso: z.string(),
  bucketSeconds: z
    .number()
    .int()
    .positive()
    .max(90 * 24 * 60 * 60),
})

export const getSessionTimeHistogramByProject = createServerFn({ method: "GET" })
  .inputValidator(sessionHistogramInputSchema)
  .handler(async ({ data, context }): Promise<readonly TraceTimeHistogramBucket[]> => {
    const startMs = Date.parse(data.rangeStartIso)
    const endMs = Date.parse(data.rangeEndIso)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return []
    }

    const orgId = await resolveOrgScope(context)

    const expandedFilters = await expandTopicFilters(orgId, ProjectId(data.projectId), data.filters)
    const mergedFilters = mergeTraceHistogramTimeFilters(expandedFilters, data.rangeStartIso, data.rangeEndIso)

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SessionRepository
        return yield* repo.histogramByProjectId({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          filters: mergedFilters,
          bucketSeconds: data.bucketSeconds,
        })
      }).pipe(withScopedClickHouse(SessionRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

export const getSessionMetricsByProject = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), filters: filterSetSchema.optional() }))
  .handler(async ({ data, context }): Promise<SessionMetrics | null> => {
    const orgId = await resolveOrgScope(context)
    const filters = await expandTopicFilters(orgId, ProjectId(data.projectId), data.filters)

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SessionRepository
        return yield* repo.aggregateMetricsByProjectId({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          ...(filters ? { filters } : {}),
        })
      }).pipe(withScopedClickHouse(SessionRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

export const getSessionCohortSummary = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data, context }): Promise<CohortSummary> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      getSessionCohortSummaryUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
      }).pipe(
        withScopedClickHouse(SessionRepositoryLive, getClickhouseClient(), orgId),
        Effect.provide(RedisCacheStoreLive(getRedisClient())),
        withTracing,
      ),
    )
  })

export interface SessionDetailRecord extends SessionRecord {
  readonly systemInstructions: GenAISystem
  readonly inputMessages: readonly GenAIMessage[]
  readonly outputMessages: readonly GenAIMessage[]
  /**
   * Trace whose conversation the panel's Conversation tab renders — the
   * server's authoritative "latest output" trace (`argMaxIf(trace_id, end_time,
   * output_messages != '')` over the session's spans), matching the
   * materialized current-state messages. Empty when no trace produced output.
   */
  readonly latestTraceId: string
}

const serializeSessionDetail = (session: SessionDetail, latestTraceId: string): SessionDetailRecord => ({
  ...serializeSession(session),
  systemInstructions: session.systemInstructions,
  inputMessages: session.inputMessages,
  outputMessages: session.outputMessages,
  latestTraceId,
})

export const getSessionDetail = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), sessionId: z.string() }))
  .handler(async ({ data, context }) => {
    const orgId = await resolveOrgScope(context)
    const projectId = ProjectId(data.projectId)

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sessionRepo = yield* SessionRepository
        const spanRepo = yield* SpanRepository
        const detail = yield* sessionRepo
          .findBySessionId({
            organizationId: orgId,
            projectId,
            sessionId: SessionId(data.sessionId),
          })
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
        if (!detail) return null

        // The trace of the latest output span — same span-level argMax the MV
        // uses for the materialized messages, scoped to this session's traces.
        const latestTraceId = yield* spanRepo.findLatestOutputTraceId({
          organizationId: orgId,
          projectId,
          traceIds: detail.traceIds.map(TraceId),
        })
        return serializeSessionDetail(detail, latestTraceId ?? "")
      }).pipe(
        withScopedClickHouse(Layer.mergeAll(SessionRepositoryLive, SpanRepositoryLive), getClickhouseClient(), orgId),
        withTracing,
      ),
    )

    // rosetta-ai GenAI types carry index signatures TanStack Start's Serialize
    // can't round-trip; cast across the boundary (useSessionDetail casts back).
    return result as never
  })

/**
 * One row per issue that has at least one score across the session's traces,
 * with occurrence counts, first/last seen, and the affected traces — all
 * scoped to those traces. Signal names/descriptions/lifecycle come from PG
 * (`findByIds`); the rollup comes from CH (`listSignalsByTraceIds`). Scoped by
 * `traceIds` (not `session_id`) so orphan sessions still surface their issues.
 * Ordered by last-seen descending (the CH query's order).
 */
export interface SessionSignalRecord {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly source: string
  readonly states: readonly string[]
  readonly occurrences: number
  readonly firstSeenAt: string
  readonly lastSeenAt: string
  readonly traceIds: readonly string[]
}

export const listSessionSignals = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      traceIds: z.array(z.string().length(32)).max(500),
    }),
  )
  .handler(async ({ data, context }): Promise<readonly SessionSignalRecord[]> => {
    if (data.traceIds.length === 0) return []

    const orgId = await resolveOrgScope(context)
    const projectId = ProjectId(data.projectId)
    const now = new Date()

    return Effect.runPromise(
      Effect.gen(function* () {
        const analytics = yield* ScoreAnalyticsRepository
        const signalRepository = yield* SignalRepository

        const rollups = yield* analytics.listSignalsByTraceIds({
          organizationId: orgId,
          projectId,
          traceIds: data.traceIds.map(TraceId),
        })
        if (rollups.length === 0) return []

        const issues = yield* signalRepository.findByIds({
          projectId,
          signalIds: rollups.map((rollup) => rollup.signalId),
        })
        const signalsById = new Map(issues.map((issue) => [issue.id, issue]))

        // Preserve the CH last-seen ordering; drop any rollup whose issue was
        // hard-deleted in PG but still has lingering score rows in CH.
        return rollups.flatMap((rollup): SessionSignalRecord[] => {
          const issue = signalsById.get(rollup.signalId)
          if (!issue) return []
          const states = deriveSignalLifecycleStates({
            issue,
            isEscalating: issue.lifecycle.isEscalating,
            now,
          })
          return [
            {
              id: issue.id,
              name: issue.name,
              description: issue.description,
              source: issue.source,
              states: [...states],
              occurrences: rollup.occurrences,
              firstSeenAt: rollup.firstSeenAt.toISOString(),
              lastSeenAt: rollup.lastSeenAt.toISOString(),
              traceIds: rollup.traceIds,
            },
          ]
        })
      }).pipe(
        withScopedPostgres(SignalRepositoryLive, getPostgresClient(), orgId),
        withScopedClickHouse(ScoreAnalyticsRepositoryLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

export const getSessionDistribution = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      field: z.enum(PERCENTILE_SESSION_FILTER_FIELDS),
    }),
  )
  .handler(async ({ data, context }): Promise<TraceDistribution> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SessionRepository
        return yield* repo.getDistribution({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          field: data.field as PercentileSessionFilterField,
        })
      }).pipe(
        withScopedClickHouse(SessionRepositoryLive, getClickhouseClient(), orgId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
    )
  })

const DISTINCT_COLUMNS = ["userId", "tags", "models", "providers", "serviceNames", "tools", "definedTools"] as const

export const getSessionDistinctValues = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      column: z.enum(DISTINCT_COLUMNS),
      limit: z.number().optional(),
      search: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<readonly string[]> => {
    const orgId = await resolveOrgScope(context)

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
      }).pipe(withScopedClickHouse(SessionRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

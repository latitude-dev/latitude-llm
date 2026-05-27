import { deriveIssueLifecycleStates, IssueRepository } from "@domain/issues"
import { ScoreAnalyticsRepository } from "@domain/scores"
import { filterSetSchema, OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import type { Session, SessionDetail, SessionDistinctColumn, SessionMetrics, SessionSearchMatch } from "@domain/spans"
import { SessionRepository, SpanRepository } from "@domain/spans"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import {
  ScoreAnalyticsRepositoryLive,
  SessionRepositoryLive,
  SpanRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import { IssueRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../../server/clients.ts"

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
      }).pipe(
        withClickHouse(SessionRepositoryLive, getClickhouseClient(), orgId),
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
    }): Promise<{
      readonly totalCount: number
      readonly matchingTraceCount?: number
    }> => {
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
        }).pipe(
          withClickHouse(SessionRepositoryLive, getClickhouseClient(), orgId),
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
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
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
        withClickHouse(Layer.mergeAll(SessionRepositoryLive, SpanRepositoryLive), getClickhouseClient(), orgId),
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
 * scoped to those traces. Issue names/descriptions/lifecycle come from PG
 * (`findByIds`); the rollup comes from CH (`listIssuesByTraceIds`). Scoped by
 * `traceIds` (not `session_id`) so orphan sessions still surface their issues.
 * Ordered by last-seen descending (the CH query's order).
 */
interface SessionIssueRecord {
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

export const listSessionIssues = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      traceIds: z.array(z.string().length(32)).max(100),
    }),
  )
  .handler(async ({ data }): Promise<readonly SessionIssueRecord[]> => {
    if (data.traceIds.length === 0) return []

    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const now = new Date()

    return Effect.runPromise(
      Effect.gen(function* () {
        const analytics = yield* ScoreAnalyticsRepository
        const issueRepository = yield* IssueRepository

        const rollups = yield* analytics.listIssuesByTraceIds({
          organizationId: orgId,
          projectId,
          traceIds: data.traceIds.map(TraceId),
        })
        if (rollups.length === 0) return []

        const issues = yield* issueRepository.findByIds({
          projectId,
          issueIds: rollups.map((rollup) => rollup.issueId),
        })
        const issuesById = new Map(issues.map((issue) => [issue.id, issue]))

        // Preserve the CH last-seen ordering; drop any rollup whose issue was
        // hard-deleted in PG but still has lingering score rows in CH.
        return rollups.flatMap((rollup): SessionIssueRecord[] => {
          const issue = issuesById.get(rollup.issueId)
          if (!issue) return []
          const states = deriveIssueLifecycleStates({
            issue,
            isEscalating: issue.lifecycle.isEscalating,
            isRegressed: issue.lifecycle.isRegressed,
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
        withPostgres(IssueRepositoryLive, getPostgresClient(), orgId),
        withClickHouse(ScoreAnalyticsRepositoryLive, getClickhouseClient(), orgId),
        withTracing,
      ),
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

import { filterSetSchema, OrganizationId, ProjectId } from "@domain/shared"
import type { Session, SessionDistinctColumn, SessionMetrics } from "@domain/spans"
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
  durationNs: session.durationNs,
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
})

export type SessionRecord = ReturnType<typeof serializeSession>

const sessionListCursorSchema = z.object({
  sortValue: z.string(),
  sessionId: z.string(),
})

interface SessionListResult {
  readonly sessions: readonly SessionRecord[]
  readonly hasMore: boolean
  readonly nextCursor?: { readonly sortValue: string; readonly sessionId: string }
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
          },
        })
      }).pipe(withClickHouse(SessionRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )

    if (!page.nextCursor) {
      return { sessions: page.items.map(serializeSession), hasMore: page.hasMore }
    }
    return {
      sessions: page.items.map(serializeSession),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
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

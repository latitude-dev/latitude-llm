import { exportSelectionSchema } from "@domain/exports"
import { filterSetSchema, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import type {
  Trace,
  TraceCohortSummary,
  TraceDetail,
  TraceDistinctColumn,
  TraceMetrics,
  TraceTimeHistogramBucket,
} from "@domain/spans"
import { getTraceCohortSummaryByTagsUseCase, mergeTraceHistogramTimeFilters, TraceRepository } from "@domain/spans"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { z } from "zod"
import { enforceExportRequestRateLimit } from "../../domains/exports/export-rate-limit.ts"
import { ensureSession } from "../../domains/sessions/session.functions.ts"
import { getSessionOrganizationId, requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getQueuePublisher, getRedisClient } from "../../server/clients.ts"

export interface TraceRecord {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly spanCount: number
  readonly errorCount: number
  readonly startTime: string
  readonly endTime: string
  readonly durationNs: number
  readonly timeToFirstTokenNs: number
  readonly tokensInput: number
  readonly tokensOutput: number
  readonly tokensCacheRead: number
  readonly tokensCacheCreate: number
  readonly tokensReasoning: number
  readonly tokensTotal: number
  readonly costInputMicrocents: number
  readonly costOutputMicrocents: number
  readonly costTotalMicrocents: number
  readonly sessionId: string
  readonly userId: string
  readonly simulationId: string
  readonly tags: readonly string[]
  readonly metadata: Readonly<Record<string, string>>
  readonly models: readonly string[]
  readonly providers: readonly string[]
  readonly serviceNames: readonly string[]
  readonly rootSpanId: string
  readonly rootSpanName: string
}

export const toTraceRecord = (trace: Trace): TraceRecord => ({
  organizationId: trace.organizationId,
  projectId: trace.projectId,
  traceId: trace.traceId,
  spanCount: trace.spanCount,
  errorCount: trace.errorCount,
  startTime: trace.startTime.toISOString(),
  endTime: trace.endTime.toISOString(),
  durationNs: trace.durationNs,
  timeToFirstTokenNs: trace.timeToFirstTokenNs,
  tokensInput: trace.tokensInput,
  tokensOutput: trace.tokensOutput,
  tokensCacheRead: trace.tokensCacheRead,
  tokensCacheCreate: trace.tokensCacheCreate,
  tokensReasoning: trace.tokensReasoning,
  tokensTotal: trace.tokensTotal,
  costInputMicrocents: trace.costInputMicrocents,
  costOutputMicrocents: trace.costOutputMicrocents,
  costTotalMicrocents: trace.costTotalMicrocents,
  sessionId: trace.sessionId,
  userId: trace.userId,
  simulationId: trace.simulationId,
  tags: trace.tags,
  metadata: trace.metadata,
  models: trace.models,
  providers: trace.providers,
  serviceNames: trace.serviceNames,
  rootSpanId: trace.rootSpanId,
  rootSpanName: trace.rootSpanName,
})

export interface TraceDetailRecord extends TraceRecord {
  readonly systemInstructions: GenAISystem
  readonly inputMessages: readonly GenAIMessage[]
  readonly outputMessages: readonly GenAIMessage[]
  readonly allMessages: readonly GenAIMessage[]
}

const serializeTraceDetail = (trace: TraceDetail): TraceDetailRecord => ({
  ...toTraceRecord(trace),
  systemInstructions: trace.systemInstructions,
  inputMessages: trace.inputMessages,
  outputMessages: trace.outputMessages,
  allMessages: trace.allMessages,
})

const traceListCursorSchema = z.object({
  sortValue: z.string(),
  traceId: z.string(),
})

interface TraceListResult {
  readonly traces: readonly TraceRecord[]
  readonly hasMore: boolean
  readonly nextCursor?: { readonly sortValue: string; readonly traceId: string }
}

export const listTracesByProject = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      limit: z.number().optional(),
      cursor: traceListCursorSchema.optional(),
      sortBy: z.string().optional(),
      sortDirection: z.enum(["asc", "desc"]).optional(),
      filters: filterSetSchema.optional(),
      searchQuery: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }): Promise<TraceListResult> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TraceRepository
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
        withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
    )

    if (!page.nextCursor) {
      return { traces: page.items.map(toTraceRecord), hasMore: page.hasMore }
    }
    return {
      traces: page.items.map(toTraceRecord),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    }
  })

export const countTracesByProject = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      filters: filterSetSchema.optional(),
      searchQuery: z.string().max(500).optional(),
      /** Ignored by the handler; optional so clients can bust HTTP caches on polling reads. */
      pollNonce: z.number().optional(),
    }),
  )
  .handler(async ({ data }): Promise<number> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TraceRepository
        return yield* repo.countByProjectId({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          ...(data.filters ? { filters: data.filters } : {}),
          ...(data.searchQuery ? { searchQuery: data.searchQuery } : {}),
        })
      }).pipe(
        withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
    )
  })

export const getTraceMetricsByProject = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      filters: filterSetSchema.optional(),
      searchQuery: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }): Promise<TraceMetrics | null> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TraceRepository
        return yield* repo.aggregateMetricsByProjectId({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          ...(data.filters ? { filters: data.filters } : {}),
          ...(data.searchQuery ? { searchQuery: data.searchQuery } : {}),
        })
      }).pipe(
        withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
    )
  })

export const getTraceCohortSummaryByTags = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), tags: z.array(z.string()).readonly() }))
  .handler(async ({ data }): Promise<TraceCohortSummary> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    return Effect.runPromise(
      getTraceCohortSummaryByTagsUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        tags: data.tags,
      }).pipe(
        withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId),
        Effect.provide(RedisCacheStoreLive(getRedisClient())),
        withTracing,
      ),
    )
  })

const traceHistogramInputSchema = z.object({
  projectId: z.string(),
  filters: filterSetSchema.optional(),
  rangeStartIso: z.string(),
  rangeEndIso: z.string(),
  bucketSeconds: z
    .number()
    .int()
    .positive()
    .max(90 * 24 * 60 * 60),
  searchQuery: z.string().max(500).optional(),
})

export const getTraceTimeHistogramByProject = createServerFn({ method: "GET" })
  .inputValidator(traceHistogramInputSchema)
  .handler(async ({ data }): Promise<readonly TraceTimeHistogramBucket[]> => {
    const startMs = Date.parse(data.rangeStartIso)
    const endMs = Date.parse(data.rangeEndIso)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return []
    }

    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const mergedFilters = mergeTraceHistogramTimeFilters(data.filters, data.rangeStartIso, data.rangeEndIso)

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TraceRepository
        return yield* repo.histogramByProjectId({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          filters: mergedFilters,
          bucketSeconds: data.bucketSeconds,
          ...(data.searchQuery ? { searchQuery: data.searchQuery } : {}),
        })
      }).pipe(
        withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
    )
  })

export const getTraceDetail = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), traceId: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TraceRepository
        const detail = yield* repo
          .findByTraceId({
            organizationId: orgId,
            projectId: ProjectId(data.projectId),
            traceId: TraceId(data.traceId),
          })
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
        return detail ? serializeTraceDetail(detail) : null
      }).pipe(
        withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
    )

    // rosetta-ai GenAI types use [x: string]: unknown index signatures, but
    // TanStack Start's Serialize<T> transforms those to [x: string]: {}.
    // Since unknown is not assignable to {}, the handler rejects the return type.
    // The runtime values are correct — this is a type-only bridge across the
    // serialization boundary. The consumer (useTraceDetail) casts back.
    return result as never
  })

const DISTINCT_COLUMNS = ["tags", "models", "providers", "serviceNames"] as const

interface EnqueuedExportResult {
  readonly type: "enqueued"
}

export const enqueueTracesExport = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      filters: filterSetSchema.optional(),
      selection: exportSelectionSchema.optional(),
    }),
  )
  .handler(async ({ data }): Promise<EnqueuedExportResult> => {
    const session = await ensureSession()
    const email = session?.user?.email
    const organizationId = getSessionOrganizationId(session)

    if (!organizationId || !email) {
      throw new Error("Unauthorized")
    }

    await enforceExportRequestRateLimit({
      redis: getRedisClient(),
      organizationId,
      projectId: data.projectId,
      recipientEmail: email,
    })

    const publisher = await getQueuePublisher()

    await Effect.runPromise(
      publisher.publish("exports", "generate", {
        kind: "traces",
        organizationId,
        projectId: data.projectId,
        recipientEmail: email,
        ...(data.filters ? { filters: data.filters } : {}),
        ...(data.selection ? { selection: data.selection } : {}),
      }),
    )

    return { type: "enqueued" }
  })

export const getTraceDistinctValues = createServerFn({ method: "GET" })
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
        const repo = yield* TraceRepository
        return yield* repo.distinctFilterValues({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          column: data.column as TraceDistinctColumn,
          ...(data.limit !== undefined ? { limit: data.limit } : {}),
          ...(data.search ? { search: data.search } : {}),
        })
      }).pipe(
        withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
    )
  })

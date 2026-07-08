import { listSessionMomentIntelligenceUseCase } from "@domain/conversation-intelligence"
import { exportSelectionSchema } from "@domain/exports"
import {
  filterSetSchema,
  PERCENTILE_TRACE_FILTER_FIELDS,
  type PercentileTraceFilterField,
  ProjectId,
  TraceId,
} from "@domain/shared"
import type {
  CohortSummary,
  Trace,
  TraceDistinctColumn,
  TraceDistribution,
  TraceMetadataDetail,
  TraceMetrics,
  TraceSearchHighlightsResult,
  TraceTimeHistogramBucket,
} from "@domain/spans"
import {
  getTraceCohortSummaryUseCase,
  getTraceConversationChunkUseCase,
  getTraceSearchHighlightsUseCase,
  mergeTraceHistogramTimeFilters,
  TraceRepository,
} from "@domain/spans"
import { AIEmbedLive, withAi } from "@platform/ai"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  SessionAnalysisRepositoryLive,
  SessionMomentLabelRepositoryLive,
  SessionSemanticMomentRepositoryLive,
  TaxonomyObservationRepositoryLive,
  TraceRepositoryLive,
  TraceSearchRepositoryLive,
} from "@platform/db-clickhouse"
import { withTracing } from "@repo/observability"
import { cacheHitRate } from "@repo/utils"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { z } from "zod"
import { enforceExportRequestRateLimit } from "../../domains/exports/export-rate-limit.ts"
import { ensureSession } from "../../domains/sessions/session.functions.ts"
import { getSessionOrganizationId } from "../../server/auth.ts"
import { getClickhouseClient, getQueuePublisher, getRedisClient } from "../../server/clients.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"

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
  readonly cacheHitRate: number | null
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

const toTraceRecord = (trace: Trace): TraceRecord => ({
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
  cacheHitRate: cacheHitRate({
    input: trace.tokensInput,
    cacheRead: trace.tokensCacheRead,
    cacheCreate: trace.tokensCacheCreate,
  }),
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

export interface SessionMomentIntelligenceRecord {
  readonly moment: {
    readonly momentId: string
    readonly analysisHash: string
    readonly firstMessageIndex: number
    readonly lastMessageIndex: number
    readonly boundaryReason: string
    readonly coherenceScore: number
  }
  readonly labels: readonly {
    readonly labelId: string
    readonly kind: string
    readonly actor: string
    readonly firstMessageIndex: number
    readonly lastMessageIndex: number
    readonly summary: string
    readonly evidence: string
    readonly confidence: number
  }[]
  readonly taxonomyObservations: readonly {
    readonly observationId: string
    readonly assignedClusterId: string | null
    readonly assignmentConfidence: number
    readonly assignmentMethod: string
  }[]
}

export interface TraceDetailRecord extends TraceRecord {
  readonly systemInstructions: GenAISystem
  readonly inputMessages: readonly GenAIMessage[]
  readonly outputMessages: readonly GenAIMessage[]
}

const serializeTraceDetail = (trace: TraceMetadataDetail): TraceDetailRecord => ({
  ...toTraceRecord(trace),
  systemInstructions: trace.systemInstructions,
  inputMessages: trace.inputMessages,
  outputMessages: trace.outputMessages,
})

export interface TraceConversationChunkRecord {
  readonly messages: readonly GenAIMessage[]
  readonly offset: number
  readonly limit: number
  readonly totalMessages: number
  readonly hasMore: boolean
  readonly payloadBytes: number
}

const traceListCursorSchema = z.object({
  sortValue: z.string(),
  secondaryValue: z.string().optional(),
  traceId: z.string(),
})

interface TraceListResult {
  readonly traces: readonly TraceRecord[]
  readonly hasMore: boolean
  readonly nextCursor?: {
    readonly sortValue: string
    readonly secondaryValue?: string | undefined
    readonly traceId: string
  }
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
  .handler(async ({ data, context }): Promise<TraceListResult> => {
    const orgId = await resolveOrgScope(context)

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
        withScopedClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId),
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
    }),
  )
  .handler(async ({ data, context }): Promise<number> => {
    const orgId = await resolveOrgScope(context)

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
        withScopedClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId),
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
  .handler(async ({ data, context }): Promise<TraceMetrics | null> => {
    const orgId = await resolveOrgScope(context)

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
        withScopedClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
    )
  })

export const getTraceCohortSummary = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data, context }): Promise<CohortSummary> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      getTraceCohortSummaryUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
      }).pipe(
        withScopedClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId),
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
  .handler(async ({ data, context }): Promise<readonly TraceTimeHistogramBucket[]> => {
    const startMs = Date.parse(data.rangeStartIso)
    const endMs = Date.parse(data.rangeEndIso)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return []
    }

    const orgId = await resolveOrgScope(context)

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
        withScopedClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
    )
  })

export const getTraceSearchHighlights = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      traceId: z.string(),
      searchQuery: z.string().max(500),
    }),
  )
  .handler(async ({ data, context }): Promise<TraceSearchHighlightsResult> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      getTraceSearchHighlightsUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        traceId: TraceId(data.traceId),
        searchQuery: data.searchQuery,
      }).pipe(
        withScopedClickHouse(Layer.merge(TraceRepositoryLive, TraceSearchRepositoryLive), getClickhouseClient(), orgId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
        Effect.orElseSucceed((): TraceSearchHighlightsResult => ({ highlights: [], firstMatchIndex: -1 })),
      ),
    )
  })

export const getSessionMomentIntelligence = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      sessionId: z.string(),
      analysisHash: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<readonly SessionMomentIntelligenceRecord[]> => {
    const orgId = await resolveOrgScope(context)
    return Effect.runPromise(
      listSessionMomentIntelligenceUseCase({
        organizationId: orgId,
        projectId: data.projectId,
        sessionId: data.sessionId,
        ...(data.analysisHash ? { analysisHash: data.analysisHash } : {}),
      }).pipe(
        Effect.map((result) =>
          result.moments.map((row) => ({
            moment: {
              momentId: row.moment.momentId,
              analysisHash: row.moment.analysisHash,
              firstMessageIndex: row.moment.firstMessageIndex,
              lastMessageIndex: row.moment.lastMessageIndex,
              boundaryReason: row.moment.boundaryReason,
              coherenceScore: row.moment.coherenceScore,
            },
            labels: row.labels.map((label) => ({
              labelId: label.labelId,
              kind: label.kind,
              actor: label.actor,
              firstMessageIndex: label.firstMessageIndex,
              lastMessageIndex: label.lastMessageIndex,
              summary: label.summary,
              evidence: label.evidence,
              confidence: label.confidence,
            })),
            taxonomyObservations: row.taxonomyObservations.map((observation) => ({
              observationId: observation.observationId,
              assignedClusterId: observation.assignedClusterId,
              assignmentConfidence: observation.assignmentConfidence,
              assignmentMethod: observation.assignmentMethod,
            })),
          })),
        ),
        withScopedClickHouse(
          Layer.mergeAll(
            SessionSemanticMomentRepositoryLive,
            SessionMomentLabelRepositoryLive,
            SessionAnalysisRepositoryLive,
            TaxonomyObservationRepositoryLive,
          ),
          getClickhouseClient(),
          orgId,
        ),
        withTracing,
      ),
    )
  })

export const getTraceDetail = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), traceId: z.string() }))
  .handler(async ({ data, context }) => {
    const orgId = await resolveOrgScope(context)

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TraceRepository
        const trace = yield* repo
          .findMetadataByTraceId({
            organizationId: orgId,
            projectId: ProjectId(data.projectId),
            traceId: TraceId(data.traceId),
          })
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
        return trace ? serializeTraceDetail(trace) : null
      }).pipe(
        withScopedClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
    )

    return result as never
  })

export const getTraceConversationChunk = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      traceId: z.string(),
      offset: z.number().int().nonnegative().optional(),
      limit: z.number().int().positive().max(100).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const orgId = await resolveOrgScope(context)
    const offset = data.offset ?? 0
    const limit = data.limit ?? 25

    const result = await Effect.runPromise(
      getTraceConversationChunkUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        traceId: TraceId(data.traceId),
        offset,
        limit,
      }).pipe(withScopedClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )

    return result as never
  })

const DISTINCT_COLUMNS = ["userId", "tags", "models", "providers", "serviceNames", "tools", "definedTools"] as const

interface EnqueuedExportResult {
  readonly type: "enqueued"
}

export const enqueueTracesExport = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      filters: filterSetSchema.optional(),
      selection: exportSelectionSchema.optional(),
      searchQuery: z.string().max(500).optional(),
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
        ...(data.searchQuery ? { searchQuery: data.searchQuery } : {}),
      }),
    )

    return { type: "enqueued" }
  })

export const getTraceDistribution = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      field: z.enum(PERCENTILE_TRACE_FILTER_FIELDS),
    }),
  )
  .handler(async ({ data, context }): Promise<TraceDistribution> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TraceRepository
        return yield* repo.getDistribution({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          field: data.field as PercentileTraceFilterField,
        })
      }).pipe(
        withScopedClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
    )
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
  .handler(async ({ data, context }): Promise<readonly string[]> => {
    const orgId = await resolveOrgScope(context)

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
        withScopedClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
    )
  })

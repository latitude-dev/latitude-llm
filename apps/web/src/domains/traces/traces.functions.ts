import { filterSetSchema, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import type { Trace, TraceDetail, TraceDistinctColumn, TraceMetrics, TraceTimeHistogramBucket } from "@domain/spans"
import { mergeTraceHistogramTimeFilters, TraceRepository } from "@domain/spans"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient } from "../../server/clients.ts"

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

const serializeTrace = (trace: Trace): TraceRecord => ({
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
  ...serializeTrace(trace),
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
    }),
  )
  .handler(async ({ data }): Promise<TraceListResult> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TraceRepository
        return yield* repo.findByProjectId({
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
      }).pipe(withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId)),
    )

    if (!page.nextCursor) {
      return { traces: page.items.map(serializeTrace), hasMore: page.hasMore }
    }
    return {
      traces: page.items.map(serializeTrace),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    }
  })

export const countTracesByProject = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), filters: filterSetSchema.optional() }))
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
        })
      }).pipe(withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId)),
    )
  })

export const getTraceMetricsByProject = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(z.object({ projectId: z.string(), filters: filterSetSchema.optional() }))
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
        })
      }).pipe(withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId)),
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
})

export const getTraceTimeHistogramByProject = createServerFn({ method: "GET" })
  .middleware([errorHandler])
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
        })
      }).pipe(withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId)),
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
        const detail = yield* repo.findByTraceId({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          traceId: TraceId(data.traceId),
        })
        return detail ? serializeTraceDetail(detail) : null
      }).pipe(withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId)),
    )

    // rosetta-ai GenAI types use [x: string]: unknown index signatures, but
    // TanStack Start's Serialize<T> transforms those to [x: string]: {}.
    // Since unknown is not assignable to {}, the handler rejects the return type.
    // The runtime values are correct — this is a type-only bridge across the
    // serialization boundary. The consumer (useTraceDetail) casts back.
    return result as never
  })

const DISTINCT_COLUMNS = ["tags", "models", "providers", "serviceNames"] as const

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
      }).pipe(withClickHouse(TraceRepositoryLive, getClickhouseClient(), orgId)),
    )
  })

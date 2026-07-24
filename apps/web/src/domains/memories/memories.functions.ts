import {
  computeRecordChangeDiffUseCase,
  computeRecordHistoryUseCase,
  computeSessionMemoryDiffUseCase,
  computeSessionMemorySummaryUseCase,
  getMemoryActivityHistogramUseCase,
  getMemoryOverviewUseCase,
  getStoreInsightsUseCase,
  listRecordUsersUseCase,
  listStoresWithMetricsUseCase,
  listStoreUsersUseCase,
  listUserStoresUseCase,
  type MemoryActivityBucket,
  type MemoryChangeKind,
  type MemoryOverview,
  type RecordChangeDiff,
  readRecordReadsUseCase,
  reconstructSnapshotUseCase,
  type SessionMemoryDiff,
  type SessionMemorySummary,
  type StoreInsights,
} from "@domain/memories"
import { ExternalUserId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import { MemoryAnalyticsRepositoryLive, MemoryRepositoryLive } from "@platform/db-clickhouse"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { getClickhouseClient } from "../../server/clients.ts"
import { traceIdSchema } from "../../server/id-validation.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"

export type SessionMemorySummaryRecord = SessionMemorySummary
export type SessionMemoryDiffRecord = SessionMemoryDiff

export type MemoryOverviewRecord = MemoryOverview

export type StoreInsightsRecord = StoreInsights

export type MemoryActivityBucketRecord = MemoryActivityBucket

export interface MemoryActivityWriteBucketRecord {
  readonly bucketStart: string
  readonly writes: number
}

export interface MemoryStoreMetricsRecord {
  readonly storeId: string
  readonly liveRecords: number
  readonly liveTokens: number
  readonly deadRecords: number
  readonly writes: number
  readonly reads: number
  readonly searches: number
  readonly zeroHitSearches: number
  readonly updateEvents: number
  readonly recordsTouched: number
  readonly sessionCount: number
  readonly userCount: number
  readonly lastActivityAt: string | null
  readonly netGrowthTokens: number
  readonly trend: readonly MemoryActivityWriteBucketRecord[]
}

interface MemoryStoreMetricsPageRecord {
  readonly items: readonly MemoryStoreMetricsRecord[]
  readonly totalCount: number
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

export interface MemoryStoreSnapshotRecord {
  readonly records: readonly {
    readonly recordId: string
    readonly tokenCount: number
    readonly lastUpdatedAt: string
  }[]
}

export interface MemoryRecordVersionRecord {
  readonly changeKind: MemoryChangeKind
  readonly tokenCount: number
  readonly tokensAdded: number
  readonly tokensRemoved: number
  readonly spanId: string
  readonly traceId: string
  readonly sessionId: string
  readonly userId: string
  readonly endTime: string
}

interface MemoryRecordDetailRecord {
  readonly body: string | null
  readonly tokenCount: number
  readonly versions: readonly MemoryRecordVersionRecord[]
}

type MemoryRecordChangeDiffRecord = RecordChangeDiff

export interface MemoryRecordReadRecord {
  readonly spanId: string
  readonly traceId: string
  readonly sessionId: string
  readonly userId: string
  readonly queryText: string
  readonly tokenCount: number
  readonly endTime: string
}

export interface MemoryRecordUserRecord {
  readonly userId: string
  readonly readCount: number
  readonly writeCount: number
  readonly lastAccessedAt: string
}

interface MemoryStoreUserRecord {
  readonly userId: string
  readonly lastAccessedAt: string
}

interface MemoryUserStoreRecord {
  readonly storeId: string
  readonly lastAccessedAt: string
}

/**
 * A session's (or one trace's) memory footprint for the summary chip. No cache
 * in v1 — the read rides the `memory_events` session bloom filter plus a single
 * batched blob fetch.
 */
export const getSessionMemorySummary = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), sessionId: z.string(), traceId: traceIdSchema.optional() }))
  .handler(async ({ data, context }): Promise<SessionMemorySummaryRecord> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      computeSessionMemorySummaryUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        sessionId: SessionId(data.sessionId),
        ...(data.traceId ? { traceId: TraceId(data.traceId) } : {}),
      }).pipe(withScopedClickHouse(MemoryRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

/**
 * A session's (or one trace's) memory writes as per-record before/after diffs,
 * for the "Memory changes" section. Fetched only when the section is expanded.
 */
export const getSessionMemoryDiff = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), sessionId: z.string(), traceId: traceIdSchema.optional() }))
  .handler(async ({ data, context }): Promise<SessionMemoryDiffRecord> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      computeSessionMemoryDiffUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        sessionId: SessionId(data.sessionId),
        ...(data.traceId ? { traceId: TraceId(data.traceId) } : {}),
      }).pipe(withScopedClickHouse(MemoryRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

/** Memory roll-up for the analytics tiles, over the selected window. Project-wide, or a single store when `storeId` is given. */
export const getMemoryOverview = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      fromIso: z.string().datetime(),
      toIso: z.string().datetime(),
      storeId: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<MemoryOverviewRecord> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      getMemoryOverviewUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        from: new Date(data.fromIso),
        to: new Date(data.toIso),
        ...(data.storeId !== undefined ? { storeId: data.storeId } : {}),
      }).pipe(withScopedClickHouse(MemoryAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

/** Bucketed memory activity (creations/updates/deletions + records retrieved) for the chart. Project-wide, or a single store when `storeId` is given. */
export const getMemoryActivityHistogram = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      fromIso: z.string().datetime(),
      toIso: z.string().datetime(),
      bucketSeconds: z.number().int().min(1).max(86_400),
      storeId: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<readonly MemoryActivityBucketRecord[]> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      getMemoryActivityHistogramUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        from: new Date(data.fromIso),
        to: new Date(data.toIso),
        bucketSeconds: data.bucketSeconds,
        ...(data.storeId !== undefined ? { storeId: data.storeId } : {}),
      }).pipe(withScopedClickHouse(MemoryAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

/** One store's Home-dashboard insight lists (retrieval, queries, footprint) over the window. */
export const getStoreInsights = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      storeId: z.string(),
      fromIso: z.string().datetime(),
      toIso: z.string().datetime(),
      listLimit: z.number().int().min(1).max(100),
      bucketSeconds: z.number().int().min(1).max(86_400),
    }),
  )
  .handler(async ({ data, context }): Promise<StoreInsightsRecord> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      getStoreInsightsUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        storeId: data.storeId,
        from: new Date(data.fromIso),
        to: new Date(data.toIso),
        listLimit: data.listLimit,
        bucketSeconds: data.bucketSeconds,
      }).pipe(withScopedClickHouse(MemoryAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

/** The project's memory stores with window-scoped insight metrics, server-sorted and paginated. */
export const listMemoryStoresWithMetrics = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      fromIso: z.string().datetime(),
      toIso: z.string().datetime(),
      sort: z
        .enum([
          "records",
          "tokens",
          "sessions",
          "users",
          "writes",
          "reads",
          "ratio",
          "dead",
          "zeroHit",
          "churn",
          "lastActivity",
        ])
        .default("lastActivity"),
      direction: z.enum(["asc", "desc"]).default("desc"),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
      trendBucketSeconds: z.number().int().min(1).max(86_400).default(86_400),
    }),
  )
  .handler(async ({ data, context }): Promise<MemoryStoreMetricsPageRecord> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      listStoresWithMetricsUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        from: new Date(data.fromIso),
        to: new Date(data.toIso),
        sortBy: data.sort,
        sortDirection: data.direction,
        limit: data.limit,
        offset: data.offset,
        trendBucketSeconds: data.trendBucketSeconds,
      }).pipe(
        Effect.map(
          (page): MemoryStoreMetricsPageRecord => ({
            items: page.items.map((store) => ({
              storeId: store.storeId,
              liveRecords: store.liveRecords,
              liveTokens: store.liveTokens,
              deadRecords: store.deadRecords,
              writes: store.writes,
              reads: store.reads,
              searches: store.searches,
              zeroHitSearches: store.zeroHitSearches,
              updateEvents: store.updateEvents,
              recordsTouched: store.recordsTouched,
              sessionCount: store.sessionCount,
              userCount: store.userCount,
              lastActivityAt: store.lastActivityAt ? store.lastActivityAt.toISOString() : null,
              netGrowthTokens: store.netGrowthTokens,
              trend: store.trend.map((bucket) => ({ bucketStart: bucket.bucketStart, writes: bucket.writes })),
            })),
            totalCount: page.totalCount,
            hasMore: page.hasMore,
            limit: page.limit,
            offset: page.offset,
          }),
        ),
        withScopedClickHouse(MemoryAnalyticsRepositoryLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

/** One store's current record ids (with light metadata) for the detail filetree. */
export const getMemoryStoreSnapshot = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), storeId: z.string() }))
  .handler(async ({ data, context }): Promise<MemoryStoreSnapshotRecord> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      reconstructSnapshotUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        storeId: data.storeId,
      }).pipe(
        Effect.map(
          (snapshot): MemoryStoreSnapshotRecord => ({
            records: snapshot.records.map((record) => ({
              recordId: record.recordId,
              tokenCount: record.tokenCount,
              lastUpdatedAt: record.endTime.toISOString(),
            })),
          }),
        ),
        withScopedClickHouse(MemoryRepositoryLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

/** One record's current body plus the ordered chain of sessions/traces that mutated it. */
export const getMemoryRecord = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), storeId: z.string(), recordId: z.string() }))
  .handler(async ({ data, context }): Promise<MemoryRecordDetailRecord> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      computeRecordHistoryUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        storeId: data.storeId,
        recordId: data.recordId,
      }).pipe(
        Effect.map(
          (history): MemoryRecordDetailRecord => ({
            body: history.body,
            tokenCount: history.tokenCount,
            versions: history.versions.map((version) => ({
              changeKind: version.changeKind,
              tokenCount: version.tokenCount,
              tokensAdded: version.tokensAdded,
              tokensRemoved: version.tokensRemoved,
              spanId: version.spanId as string,
              traceId: version.traceId as string,
              sessionId: version.sessionId as string,
              userId: version.userId as string,
              endTime: version.endTime.toISOString(),
            })),
          }),
        ),
        withScopedClickHouse(MemoryRepositoryLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

/** One change's before/after bodies (its authoring span vs. the prior snapshot) for the diff view. */
export const getMemoryRecordChangeDiff = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), storeId: z.string(), recordId: z.string(), spanId: z.string() }))
  .handler(async ({ data, context }): Promise<MemoryRecordChangeDiffRecord> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      computeRecordChangeDiffUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        storeId: data.storeId,
        recordId: data.recordId,
        spanId: SpanId(data.spanId),
      }).pipe(withScopedClickHouse(MemoryRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

/** One record's retrieval (read) events — newest first, capped — for the Reads tab. */
export const getMemoryRecordReads = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), storeId: z.string(), recordId: z.string() }))
  .handler(async ({ data, context }): Promise<readonly MemoryRecordReadRecord[]> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      readRecordReadsUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        storeId: data.storeId,
        recordId: data.recordId,
      }).pipe(
        Effect.map((events) =>
          events.map(
            (event): MemoryRecordReadRecord => ({
              spanId: event.spanId as string,
              traceId: event.traceId as string,
              sessionId: event.sessionId as string,
              userId: event.userId as string,
              queryText: event.queryText,
              tokenCount: event.tokenCount,
              endTime: event.endTime.toISOString(),
            }),
          ),
        ),
        withScopedClickHouse(MemoryRepositoryLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

/** The end-users who accessed one record (reads + writes counted), newest access first. */
export const listMemoryRecordUsers = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), storeId: z.string(), recordId: z.string() }))
  .handler(async ({ data, context }): Promise<readonly MemoryRecordUserRecord[]> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      listRecordUsersUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        storeId: data.storeId,
        recordId: data.recordId,
      }).pipe(
        Effect.map((users) =>
          users.map(
            (user): MemoryRecordUserRecord => ({
              userId: user.userId as string,
              readCount: user.readCount,
              writeCount: user.writeCount,
              lastAccessedAt: user.lastAccessedAt.toISOString(),
            }),
          ),
        ),
        withScopedClickHouse(MemoryRepositoryLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

/** The end-users who accessed one store (reads count), newest access first. */
export const listMemoryStoreUsers = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), storeId: z.string() }))
  .handler(async ({ data, context }): Promise<readonly MemoryStoreUserRecord[]> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      listStoreUsersUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        storeId: data.storeId,
      }).pipe(
        Effect.map((users) =>
          users.map(
            (user): MemoryStoreUserRecord => ({
              userId: user.userId as string,
              lastAccessedAt: user.lastAccessedAt.toISOString(),
            }),
          ),
        ),
        withScopedClickHouse(MemoryRepositoryLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

/** The memory stores one end-user accessed (reads count), newest access first. */
export const listUserMemoryStores = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), userId: z.string() }))
  .handler(async ({ data, context }): Promise<readonly MemoryUserStoreRecord[]> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      listUserStoresUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        userId: ExternalUserId(data.userId),
      }).pipe(
        Effect.map((stores) =>
          stores.map(
            (store): MemoryUserStoreRecord => ({
              storeId: store.storeId,
              lastAccessedAt: store.lastAccessedAt.toISOString(),
            }),
          ),
        ),
        withScopedClickHouse(MemoryRepositoryLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

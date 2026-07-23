import {
  computeRecordChangeDiffUseCase,
  computeRecordHistoryUseCase,
  computeSessionMemoryDiffUseCase,
  computeSessionMemorySummaryUseCase,
  getMemoryActivityHistogramUseCase,
  getMemoryAnalyticsOverviewUseCase,
  isMemoryStoreMetricsSortField,
  listRecordUsersUseCase,
  listStoresWithMetricsUseCase,
  listStoreUsersUseCase,
  listUserStoresUseCase,
  listZeroHitQueriesUseCase,
  type MemoryChangeKind,
  type MemoryStoreMetricsSortField,
  type RecordChangeDiff,
  readRecordReadsUseCase,
  reconstructSnapshotUseCase,
  type SessionMemoryDiff,
  type SessionMemorySummary,
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

export interface MemoryStoreRecord {
  readonly storeId: string
  readonly recordCount: number
  readonly tokenCount: number
  readonly lastUpdatedAt: string
  readonly lastReadAt: string | null
  readonly sessionCount: number
  readonly userCount: number
}

export interface MemoryAnalyticsOverviewRecord {
  readonly liveRecords: number
  readonly liveTokens: number
  readonly neverReadLiveTokens: number
  readonly readSessions: number
  readonly retrievedTokens: number
  readonly searchCount: number
  readonly zeroHitSearchCount: number
  readonly contentWrites: number
  readonly noopWrites: number
  readonly completedVersions: number
  readonly consumedVersions: number
}

export interface MemoryActivityBucketRecord {
  readonly bucketStart: string
  readonly adds: number
  readonly updates: number
  readonly removes: number
  readonly reads: number
}

export interface MemoryStoreMetricsRecord extends MemoryStoreRecord {
  readonly readSessions: number
  readonly contentWrites: number
  readonly completedVersions: number
  readonly consumedVersions: number
  readonly netTokenGrowth: number
  readonly trend: readonly { readonly bucketStart: string; readonly writes: number; readonly reads: number }[]
}

interface MemoryStoreMetricsPageRecord {
  readonly items: readonly MemoryStoreMetricsRecord[]
  readonly totalCount: number
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

export interface MemoryZeroHitQueryRecord {
  readonly queryText: string
  readonly searchCount: number
  readonly storeCount: number
  readonly anyStoreId: string
  readonly lastSeenAt: string
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

const analyticsScopeSchema = z.object({
  projectId: z.string(),
  storeId: z.string().optional(),
  fromIso: z.string().datetime(),
  toIso: z.string().datetime(),
})

const MAX_BUCKET_SECONDS = 90 * 24 * 60 * 60

/** The Memory-page (or store-scoped) analytics tile roll-up over the ledger. */
export const getMemoryAnalyticsOverview = createServerFn({ method: "GET" })
  .inputValidator(analyticsScopeSchema)
  .handler(async ({ data, context }): Promise<MemoryAnalyticsOverviewRecord> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      getMemoryAnalyticsOverviewUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        ...(data.storeId !== undefined ? { storeId: data.storeId } : {}),
        range: { from: new Date(data.fromIso), to: new Date(data.toIso) },
      }).pipe(withScopedClickHouse(MemoryAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

/** Bucketed mutation/read activity for the Memory analytics chart. */
export const getMemoryActivityHistogram = createServerFn({ method: "GET" })
  .inputValidator(analyticsScopeSchema.extend({ bucketSeconds: z.number().int().positive().max(MAX_BUCKET_SECONDS) }))
  .handler(async ({ data, context }): Promise<readonly MemoryActivityBucketRecord[]> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      getMemoryActivityHistogramUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        ...(data.storeId !== undefined ? { storeId: data.storeId } : {}),
        range: { from: new Date(data.fromIso), to: new Date(data.toIso) },
        bucketSeconds: data.bucketSeconds,
      }).pipe(
        Effect.map((buckets) =>
          buckets.map(
            (bucket): MemoryActivityBucketRecord => ({
              bucketStart: bucket.bucketStart.toISOString(),
              adds: bucket.adds,
              updates: bucket.updates,
              removes: bucket.removes,
              reads: bucket.reads,
            }),
          ),
        ),
        withScopedClickHouse(MemoryAnalyticsRepositoryLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

/** The project's memory stores with range-scoped insight metrics and trend sparklines. */
export const listMemoryStoresWithMetrics = createServerFn({ method: "GET" })
  .inputValidator(
    analyticsScopeSchema.extend({
      sort: z.string().default("lastUpdated"),
      direction: z.enum(["asc", "desc"]).default("desc"),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
      trendBucketSeconds: z.number().int().positive().max(MAX_BUCKET_SECONDS),
    }),
  )
  .handler(async ({ data, context }): Promise<MemoryStoreMetricsPageRecord> => {
    const orgId = await resolveOrgScope(context)
    const sortBy: MemoryStoreMetricsSortField = isMemoryStoreMetricsSortField(data.sort) ? data.sort : "lastUpdated"

    return Effect.runPromise(
      listStoresWithMetricsUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        range: { from: new Date(data.fromIso), to: new Date(data.toIso) },
        options: { sortBy, sortDirection: data.direction, limit: data.limit, offset: data.offset },
        trendBucketSeconds: data.trendBucketSeconds,
      }).pipe(
        Effect.map(({ page, trends }): MemoryStoreMetricsPageRecord => {
          const trendByStore = new Map<string, { bucketStart: string; writes: number; reads: number }[]>()
          for (const bucket of trends) {
            const list = trendByStore.get(bucket.storeId) ?? []
            list.push({ bucketStart: bucket.bucketStart.toISOString(), writes: bucket.writes, reads: bucket.reads })
            trendByStore.set(bucket.storeId, list)
          }
          return {
            items: page.items.map(
              (store): MemoryStoreMetricsRecord => ({
                storeId: store.storeId,
                recordCount: store.recordCount,
                tokenCount: store.tokenCount,
                lastUpdatedAt: store.lastUpdatedAt.toISOString(),
                lastReadAt: store.lastReadAt ? store.lastReadAt.toISOString() : null,
                sessionCount: store.sessionCount,
                userCount: store.userCount,
                readSessions: store.readSessions,
                contentWrites: store.contentWrites,
                completedVersions: store.completedVersions,
                consumedVersions: store.consumedVersions,
                netTokenGrowth: store.netTokenGrowth,
                trend: trendByStore.get(store.storeId) ?? [],
              }),
            ),
            totalCount: page.totalCount,
            hasMore: page.hasMore,
            limit: page.limit,
            offset: page.offset,
          }
        }),
        withScopedClickHouse(MemoryAnalyticsRepositoryLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

/** Searches that returned nothing, grouped by query text — the "what to add" report. */
export const listMemoryZeroHitQueries = createServerFn({ method: "GET" })
  .inputValidator(analyticsScopeSchema.extend({ limit: z.number().int().min(1).max(100).optional() }))
  .handler(async ({ data, context }): Promise<readonly MemoryZeroHitQueryRecord[]> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      listZeroHitQueriesUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        ...(data.storeId !== undefined ? { storeId: data.storeId } : {}),
        range: { from: new Date(data.fromIso), to: new Date(data.toIso) },
        ...(data.limit !== undefined ? { limit: data.limit } : {}),
      }).pipe(
        Effect.map((groups) =>
          groups.map(
            (group): MemoryZeroHitQueryRecord => ({
              queryText: group.queryText,
              searchCount: group.searchCount,
              storeCount: group.storeCount,
              anyStoreId: group.anyStoreId,
              lastSeenAt: group.lastSeenAt.toISOString(),
            }),
          ),
        ),
        withScopedClickHouse(MemoryAnalyticsRepositoryLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

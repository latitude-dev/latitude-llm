import {
  computeSessionMemorySummaryUseCase,
  listMemoryStoresUseCase,
  listStoreUsersUseCase,
  listUserStoresUseCase,
  type MemoryChangeKind,
  MemoryRepository,
  reconstructSnapshotUseCase,
  type SessionMemorySummary,
} from "@domain/memories"
import { ExternalUserId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { MemoryRepositoryLive } from "@platform/db-clickhouse"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { getClickhouseClient } from "../../server/clients.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"

export type SessionMemorySummaryRecord = SessionMemorySummary

export interface MemoryStoreRecord {
  readonly storeId: string
  readonly recordCount: number
  readonly tokenCount: number
  readonly lastUpdatedAt: string
  readonly lastReadAt: string | null
  readonly sessionCount: number
  readonly userCount: number
}

interface MemoryStoresPageRecord {
  readonly items: readonly MemoryStoreRecord[]
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
  readonly spanId: string
  readonly traceId: string
  readonly sessionId: string
  readonly endTime: string
}

interface MemoryRecordDetailRecord {
  readonly body: string | null
  readonly tokenCount: number
  readonly versions: readonly MemoryRecordVersionRecord[]
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
  .inputValidator(z.object({ projectId: z.string(), sessionId: z.string(), traceId: z.string().optional() }))
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

/** The project's memory stores, one roll-up row each, server-sorted and paginated. */
export const listMemoryStores = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      sort: z.enum(["lastUpdated", "lastRead", "records", "tokens", "sessions", "users"]).default("lastUpdated"),
      direction: z.enum(["asc", "desc"]).default("desc"),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }),
  )
  .handler(async ({ data, context }): Promise<MemoryStoresPageRecord> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      listMemoryStoresUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        options: { sortBy: data.sort, sortDirection: data.direction, limit: data.limit, offset: data.offset },
      }).pipe(
        Effect.map(
          (page): MemoryStoresPageRecord => ({
            items: page.items.map((store) => ({
              storeId: store.storeId,
              recordCount: store.recordCount,
              tokenCount: store.tokenCount,
              lastUpdatedAt: store.lastUpdatedAt.toISOString(),
              lastReadAt: store.lastReadAt ? store.lastReadAt.toISOString() : null,
              sessionCount: store.sessionCount,
              userCount: store.userCount,
            })),
            totalCount: page.totalCount,
            hasMore: page.hasMore,
            limit: page.limit,
            offset: page.offset,
          }),
        ),
        withScopedClickHouse(MemoryRepositoryLive, getClickhouseClient(), orgId),
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
      Effect.gen(function* () {
        const memoryRepository = yield* MemoryRepository
        const versions = yield* memoryRepository.readRecordVersions({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          records: [{ storeId: data.storeId, recordId: data.recordId }],
        })
        // Version chain is end_time ASC; the current body is the newest non-remove version.
        const newestFirst = [...versions].reverse()
        const current = newestFirst.find((version) => version.changeKind !== "remove")
        const blobs = current
          ? yield* memoryRepository.readBlobs({ organizationId: orgId, hashes: [current.contentHash] })
          : []
        const body = current ? (blobs.find((blob) => blob.contentHash === current.contentHash)?.content ?? null) : null
        return {
          body,
          tokenCount: current?.tokenCount ?? 0,
          versions: newestFirst.map((version) => ({
            changeKind: version.changeKind,
            tokenCount: version.tokenCount,
            spanId: version.spanId as string,
            traceId: version.traceId as string,
            sessionId: version.sessionId as string,
            endTime: version.endTime.toISOString(),
          })),
        } satisfies MemoryRecordDetailRecord
      }).pipe(withScopedClickHouse(MemoryRepositoryLive, getClickhouseClient(), orgId), withTracing),
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

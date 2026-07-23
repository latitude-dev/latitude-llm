import type {
  MemoryAnalyticsRepositoryShape,
  MemoryCurrentEntry,
  MemoryEvent,
  MemoryRepositoryShape,
  MemoryStoreMetricSortField,
} from "@domain/memories"
import { MemoryAnalyticsRepository, MemoryRepository } from "@domain/memories"
import {
  type ChSqlClient,
  ExternalUserId,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SessionId,
  SpanId,
  TraceId,
} from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { MemoryAnalyticsRepositoryLive } from "./memory-analytics-repository.ts"
import { MemoryRepositoryLive } from "./memory-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const traceId = TraceId("t".repeat(32))
const base = new Date("2026-06-01T12:00:00.000Z").getTime()
const at = (seconds: number) => new Date(base + seconds * 1000)
const spanN = (n: number) => SpanId(String(n).padStart(16, "0"))
const from = at(0)
const to = at(100)

const ch = setupTestClickHouse()

const seed = (f: (repo: MemoryRepositoryShape) => Effect.Effect<unknown, RepositoryError, ChSqlClient>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* MemoryRepository
      return yield* f(repo)
    }).pipe(withClickHouse(MemoryRepositoryLive, ch.client, organizationId)),
  )

const query = <A>(f: (repo: MemoryAnalyticsRepositoryShape) => Effect.Effect<A, RepositoryError, ChSqlClient>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* MemoryAnalyticsRepository
      return yield* f(repo)
    }).pipe(withClickHouse(MemoryAnalyticsRepositoryLive, ch.client, organizationId)),
  )

let spanCounter = 0
const nextSpan = () => {
  spanCounter += 1
  return spanN(spanCounter)
}
const makeEvent = (o: Partial<MemoryEvent> = {}): MemoryEvent => ({
  organizationId,
  projectId,
  storeId: "A",
  recordId: "rec1",
  operation: "create_memory",
  changeKind: "add",
  contentHash: "hash-a",
  tokenCount: 10,
  recordCount: 1,
  queryText: "",
  spanId: nextSpan(),
  traceId,
  sessionId: SessionId("sess1"),
  userId: ExternalUserId("user1"),
  startTime: at(0),
  endTime: at(0),
  source: "otlp",
  ...o,
})

const makeCurrent = (o: Partial<MemoryCurrentEntry> = {}): MemoryCurrentEntry => ({
  organizationId,
  projectId,
  storeId: "A",
  recordId: "rec1",
  contentHash: "hash-a",
  changeKind: "add",
  tokenCount: 10,
  spanId: spanN(0),
  traceId,
  sessionId: SessionId("sess1"),
  endTime: at(0),
  ...o,
})

const list = (
  opts: Partial<{
    sortBy: MemoryStoreMetricSortField
    sortDirection: "asc" | "desc"
    limit: number
    offset: number
  }> = {},
) =>
  query((repo) =>
    repo.listStoresWithMetrics({
      organizationId,
      projectId,
      from,
      to,
      sortBy: opts.sortBy ?? "lastActivity",
      sortDirection: opts.sortDirection ?? "desc",
      limit: opts.limit ?? 50,
      offset: opts.offset ?? 0,
      trendBucketSeconds: 3600,
    }),
  )

describe("MemoryAnalyticsRepository.listStoresWithMetrics", () => {
  it("rolls up window activity, current-state live/dead, net growth and the write trend", async () => {
    await seed((repo) =>
      repo.insertEvents([
        makeEvent({
          storeId: "A",
          recordId: "r1",
          changeKind: "add",
          tokenCount: 100,
          endTime: at(10),
          userId: ExternalUserId("u1"),
        }),
        makeEvent({
          storeId: "A",
          recordId: "r1",
          changeKind: "update",
          tokenCount: 120,
          endTime: at(20),
          userId: ExternalUserId("u1"),
        }),
        makeEvent({
          storeId: "A",
          recordId: "r1",
          changeKind: "read",
          recordCount: 2,
          endTime: at(30),
          sessionId: SessionId("s2"),
          userId: ExternalUserId("u2"),
        }),
        makeEvent({
          storeId: "A",
          recordId: "",
          changeKind: "read",
          recordCount: 0,
          endTime: at(35),
          sessionId: SessionId("s3"),
          userId: ExternalUserId(""),
        }),
      ]),
    )
    await seed((repo) =>
      repo.upsertCurrent([
        makeCurrent({ storeId: "A", recordId: "r1", changeKind: "update", tokenCount: 120, endTime: at(20) }),
      ]),
    )

    const page = await list()
    expect(page.items).toHaveLength(1)
    const a = page.items[0]!
    expect(a.storeId).toBe("A")
    expect(a.writes).toBe(2)
    expect(a.updateEvents).toBe(1)
    expect(a.recordsTouched).toBe(1)
    expect(a.reads).toBe(1)
    expect(a.searches).toBe(2)
    expect(a.zeroHitSearches).toBe(1)
    expect(a.sessionCount).toBe(3)
    expect(a.userCount).toBe(2)
    expect(a.liveRecords).toBe(1)
    expect(a.liveTokens).toBe(120)
    expect(a.deadRecords).toBe(0)
    expect(a.lastActivityAt?.getTime()).toBe(at(35).getTime())
    expect(a.netGrowthTokens).toBe(120)
    expect(a.trend).toHaveLength(1)
    expect(a.trend[0]!.writes).toBe(2)
  })

  it("marks a live record never returned by a search as dead", async () => {
    await seed((repo) =>
      repo.insertEvents([
        makeEvent({ storeId: "B", recordId: "r1", changeKind: "add", tokenCount: 50, endTime: at(40) }),
        makeEvent({ storeId: "B", recordId: "", changeKind: "read", recordCount: 0, endTime: at(45) }),
      ]),
    )
    await seed((repo) =>
      repo.upsertCurrent([makeCurrent({ storeId: "B", recordId: "r1", tokenCount: 50, endTime: at(40) })]),
    )

    const b = (await list()).items.find((s) => s.storeId === "B")!
    expect(b.liveRecords).toBe(1)
    expect(b.deadRecords).toBe(1)
  })

  it("scopes window counts to the range but reconstructs net growth across the boundary", async () => {
    await seed((repo) =>
      repo.insertEvents([
        makeEvent({ storeId: "C", recordId: "r1", changeKind: "add", tokenCount: 30, endTime: at(-50) }),
        makeEvent({ storeId: "C", recordId: "r1", changeKind: "update", tokenCount: 45, endTime: at(60) }),
      ]),
    )
    await seed((repo) =>
      repo.upsertCurrent([
        makeCurrent({ storeId: "C", recordId: "r1", changeKind: "update", tokenCount: 45, endTime: at(60) }),
      ]),
    )

    const c = (await list()).items.find((s) => s.storeId === "C")!
    expect(c.writes).toBe(1)
    expect(c.netGrowthTokens).toBe(15)
  })

  it("drives the store set from window activity, keeping '' and dropping lifecycle-only / out-of-window stores", async () => {
    await seed((repo) =>
      repo.insertEvents([
        makeEvent({ storeId: "active", recordId: "r1", changeKind: "add", endTime: at(10) }),
        makeEvent({
          storeId: "lifecycle",
          recordId: "",
          operation: "create_memory_store",
          changeKind: "store_create",
          endTime: at(10),
        }),
        makeEvent({ storeId: "stale", recordId: "r1", changeKind: "add", endTime: at(500) }),
        makeEvent({ storeId: "", recordId: "r1", changeKind: "read", recordCount: 1, endTime: at(12) }),
      ]),
    )
    const ids = (await list()).items.map((s) => s.storeId).sort()
    expect(ids).toEqual(["", "active"])
  })

  it("dedups a duplicated (retried) event and sorts/paginates server-side", async () => {
    const dup = makeEvent({ storeId: "D", recordId: "r1", changeKind: "add", spanId: spanN(900), endTime: at(10) })
    await seed((repo) => repo.insertEvents([dup, dup]))
    await seed((repo) =>
      repo.insertEvents([
        makeEvent({ storeId: "E", recordId: "r1", changeKind: "add", spanId: spanN(901), endTime: at(11) }),
        makeEvent({ storeId: "E", recordId: "r2", changeKind: "add", spanId: spanN(902), endTime: at(12) }),
      ]),
    )

    const d = (await list()).items.find((s) => s.storeId === "D")!
    expect(d.writes).toBe(1)

    const desc = await list({ sortBy: "writes", sortDirection: "desc", limit: 1, offset: 0 })
    expect(desc.items.map((s) => s.storeId)).toEqual(["E"])
    expect(desc.hasMore).toBe(true)
    expect(desc.totalCount).toBe(2)
  })
})

describe("MemoryAnalyticsRepository.getMemoryOverview", () => {
  it("rolls up project-wide live/dead tokens and window activity", async () => {
    await seed((repo) =>
      repo.insertEvents([
        makeEvent({ storeId: "A", recordId: "r1", changeKind: "add", endTime: at(10) }),
        makeEvent({ storeId: "A", recordId: "r1", changeKind: "read", recordCount: 1, endTime: at(20) }),
        makeEvent({ storeId: "B", recordId: "r1", changeKind: "add", endTime: at(30) }),
        makeEvent({ storeId: "B", recordId: "", changeKind: "read", recordCount: 0, endTime: at(40) }),
        makeEvent({ storeId: "A", recordId: "r1", changeKind: "update", endTime: at(500) }),
      ]),
    )
    await seed((repo) =>
      repo.upsertCurrent([
        makeCurrent({ storeId: "A", recordId: "r1", tokenCount: 100, endTime: at(10) }),
        makeCurrent({ storeId: "B", recordId: "r1", tokenCount: 40, endTime: at(30) }),
      ]),
    )

    const o = await query((repo) => repo.getMemoryOverview({ organizationId, projectId, from, to }))
    expect(o.liveRecords).toBe(2)
    expect(o.liveTokens).toBe(140)
    expect(o.deadTokens).toBe(40)
    expect(o.searches).toBe(2)
    expect(o.zeroHitSearches).toBe(1)
    expect(o.writes).toBe(2)
    expect(o.recordsRetrieved).toBe(1)
  })
})

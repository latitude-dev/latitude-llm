import { ChSqlClient, ExternalUserId, OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { MemoryStoreMetricSortField } from "../entities/memory-analytics.ts"
import type { MemoryCurrentEntry } from "../entities/memory-current.ts"
import type { MemoryEvent } from "../entities/memory-event.ts"
import { MemoryAnalyticsRepository } from "../ports/memory-analytics-repository.ts"
import { createFakeMemoryAnalyticsRepository } from "../testing/index.ts"
import { getMemoryOverviewUseCase } from "./get-memory-overview.ts"
import { listStoresWithMetricsUseCase } from "./list-stores-with-metrics.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const traceId = TraceId("t".repeat(32))
const base = new Date("2026-06-01T12:00:00.000Z").getTime()
const at = (seconds: number) => new Date(base + seconds * 1000)
const sid = (n: number) => SpanId(String(n).padStart(16, "0"))
const from = at(0)
const to = at(100)

type Fake = ReturnType<typeof createFakeMemoryAnalyticsRepository>

let spanCounter = 0
const nextSpan = () => {
  spanCounter += 1
  return sid(spanCounter)
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
  startTime: o.endTime ?? at(0),
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
  spanId: sid(0),
  traceId,
  sessionId: SessionId("sess1"),
  endTime: at(0),
  ...o,
})

const layerFor = (memory: Fake) =>
  Layer.mergeAll(
    Layer.succeed(MemoryAnalyticsRepository, memory.repository),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
  )

const seed = (memory: Fake, events: readonly MemoryEvent[], current: readonly MemoryCurrentEntry[]) => {
  memory.events.push(...events)
  memory.current.push(...current)
}

const run = (
  memory: Fake,
  opts: Partial<{
    sortBy: MemoryStoreMetricSortField
    sortDirection: "asc" | "desc"
    limit: number
    offset: number
    trendBucketSeconds: number
  }> = {},
) =>
  Effect.runPromise(
    listStoresWithMetricsUseCase({
      organizationId,
      projectId,
      from,
      to,
      sortBy: opts.sortBy ?? "lastActivity",
      sortDirection: opts.sortDirection ?? "desc",
      limit: opts.limit ?? 50,
      offset: opts.offset ?? 0,
      trendBucketSeconds: opts.trendBucketSeconds ?? 3600,
    }).pipe(Effect.provide(layerFor(memory))),
  )

describe("listStoresWithMetrics", () => {
  it("rolls up window writes/reads/searches and current-state live/dead, with net growth from the ledger boundaries", async () => {
    const memory = createFakeMemoryAnalyticsRepository()
    seed(
      memory,
      [
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
        // zero-hit search: counts as a search but not a retrieved record, and its user is anonymous
        makeEvent({
          storeId: "A",
          recordId: "",
          changeKind: "read",
          recordCount: 0,
          endTime: at(35),
          sessionId: SessionId("s3"),
          userId: ExternalUserId(""),
        }),
      ],
      [makeCurrent({ storeId: "A", recordId: "r1", tokenCount: 120, changeKind: "update", endTime: at(20) })],
    )

    const page = await run(memory)
    expect(page.items).toHaveLength(1)
    const a = page.items[0]!
    expect(a.storeId).toBe("A")
    expect(a.writes).toBe(2)
    expect(a.updateEvents).toBe(1)
    expect(a.recordsTouched).toBe(1)
    expect(a.reads).toBe(1)
    expect(a.searches).toBe(2)
    expect(a.zeroHitSearches).toBe(1)
    expect(a.sessionCount).toBe(3) // sess1, s2, s3
    expect(a.userCount).toBe(2) // u1, u2 ('' excluded)
    expect(a.liveRecords).toBe(1)
    expect(a.liveTokens).toBe(120)
    expect(a.deadRecords).toBe(0) // r1 was read (record_count>0)
    expect(a.lastActivityAt?.getTime()).toBe(at(35).getTime())
    expect(a.netGrowthTokens).toBe(120) // 0 at window start → 120 at window end
    expect(a.trend).toEqual([{ bucketStart: a.trend[0]!.bucketStart, writes: 2 }])
  })

  it("counts a live record never returned by a search as dead", async () => {
    const memory = createFakeMemoryAnalyticsRepository()
    seed(
      memory,
      [
        makeEvent({ storeId: "B", recordId: "r1", changeKind: "add", tokenCount: 50, endTime: at(40) }),
        // a zero-hit search does not mark any record read
        makeEvent({ storeId: "B", recordId: "", changeKind: "read", recordCount: 0, endTime: at(45) }),
      ],
      [makeCurrent({ storeId: "B", recordId: "r1", tokenCount: 50, endTime: at(40) })],
    )
    const b = (await run(memory)).items[0]!
    expect(b.liveRecords).toBe(1)
    expect(b.deadRecords).toBe(1)
  })

  it("scopes window counts to the range but reconstructs net growth across the boundary", async () => {
    const memory = createFakeMemoryAnalyticsRepository()
    seed(
      memory,
      [
        // created before the window (excluded from window counts, included in the boundary snapshot)
        makeEvent({ storeId: "C", recordId: "r1", changeKind: "add", tokenCount: 30, endTime: at(-50) }),
        makeEvent({ storeId: "C", recordId: "r1", changeKind: "update", tokenCount: 45, endTime: at(60) }),
      ],
      [makeCurrent({ storeId: "C", recordId: "r1", tokenCount: 45, changeKind: "update", endTime: at(60) })],
    )
    const c = (await run(memory)).items[0]!
    expect(c.writes).toBe(1) // only the in-window update
    expect(c.netGrowthTokens).toBe(15) // 30 at start → 45 at end
  })

  it("drives the store set from window activity — a store with only lifecycle or out-of-window events is excluded", async () => {
    const memory = createFakeMemoryAnalyticsRepository()
    seed(
      memory,
      [
        makeEvent({ storeId: "active", recordId: "r1", changeKind: "add", endTime: at(10) }),
        makeEvent({ storeId: "lifecycle", recordId: "", changeKind: "store_create", endTime: at(10) }),
        makeEvent({ storeId: "stale", recordId: "r1", changeKind: "add", endTime: at(500) }),
        makeEvent({ storeId: "", recordId: "r1", changeKind: "read", recordCount: 1, endTime: at(12) }),
      ],
      [makeCurrent({ storeId: "active", recordId: "r1", endTime: at(10) })],
    )
    const ids = (await run(memory)).items.map((s) => s.storeId).sort()
    expect(ids).toEqual(["", "active"])
  })

  it("does not double-count a duplicated (retried) event", async () => {
    const memory = createFakeMemoryAnalyticsRepository()
    const dup = makeEvent({ storeId: "A", recordId: "r1", changeKind: "add", spanId: sid(999), endTime: at(10) })
    seed(memory, [dup, { ...dup }], [makeCurrent({ storeId: "A", recordId: "r1", endTime: at(10) })])
    const a = (await run(memory)).items[0]!
    expect(a.writes).toBe(1)
  })

  it("sorts server-side and paginates with a stable total", async () => {
    const memory = createFakeMemoryAnalyticsRepository()
    seed(
      memory,
      [
        makeEvent({ storeId: "A", recordId: "r1", changeKind: "add", endTime: at(10) }),
        makeEvent({ storeId: "B", recordId: "r1", changeKind: "add", endTime: at(11) }),
        makeEvent({ storeId: "B", recordId: "r2", changeKind: "add", endTime: at(12) }),
        makeEvent({ storeId: "C", recordId: "r1", changeKind: "add", endTime: at(13) }),
        makeEvent({ storeId: "C", recordId: "r2", changeKind: "add", endTime: at(14) }),
        makeEvent({ storeId: "C", recordId: "r3", changeKind: "add", endTime: at(15) }),
      ],
      [],
    )
    const order = async (sortBy: MemoryStoreMetricSortField, dir: "asc" | "desc") =>
      (await run(memory, { sortBy, sortDirection: dir })).items.map((s) => s.storeId)
    expect(await order("writes", "desc")).toEqual(["C", "B", "A"])
    expect(await order("writes", "asc")).toEqual(["A", "B", "C"])

    const p0 = await run(memory, { sortBy: "writes", sortDirection: "desc", limit: 2, offset: 0 })
    expect(p0.items.map((s) => s.storeId)).toEqual(["C", "B"])
    expect(p0.hasMore).toBe(true)
    expect(p0.totalCount).toBe(3)
  })
})

describe("getMemoryOverview", () => {
  const overview = (memory: Fake) =>
    Effect.runPromise(
      getMemoryOverviewUseCase({ organizationId, projectId, from, to }).pipe(Effect.provide(layerFor(memory))),
    )

  it("rolls up project-wide live/dead tokens and window activity", async () => {
    const memory = createFakeMemoryAnalyticsRepository()
    seed(
      memory,
      [
        makeEvent({ storeId: "A", recordId: "r1", changeKind: "add", endTime: at(10) }),
        makeEvent({ storeId: "A", recordId: "r1", changeKind: "read", recordCount: 1, endTime: at(20) }),
        makeEvent({ storeId: "B", recordId: "r1", changeKind: "add", endTime: at(30) }),
        // a zero-hit search bumps searches but not records retrieved
        makeEvent({ storeId: "B", recordId: "", changeKind: "read", recordCount: 0, endTime: at(40) }),
        // out of window → excluded from window activity
        makeEvent({ storeId: "A", recordId: "r1", changeKind: "update", endTime: at(500) }),
      ],
      [
        makeCurrent({ storeId: "A", recordId: "r1", tokenCount: 100, endTime: at(10) }), // read → live, not dead
        makeCurrent({ storeId: "B", recordId: "r1", tokenCount: 40, endTime: at(30) }), // never read → dead
      ],
    )
    const o = await overview(memory)
    expect(o.liveRecords).toBe(2)
    expect(o.liveTokens).toBe(140)
    expect(o.deadTokens).toBe(40)
    expect(o.searches).toBe(2)
    expect(o.zeroHitSearches).toBe(1)
    expect(o.writes).toBe(2) // two in-window adds; the at(500) update is excluded
    expect(o.recordsRetrieved).toBe(1)
  })
})

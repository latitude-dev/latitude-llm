import { ChSqlClient, ExternalUserId, OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { MemoryCurrentEntry } from "../entities/memory-current.ts"
import type { MemoryEvent } from "../entities/memory-event.ts"
import { MemoryAnalyticsRepository } from "../ports/memory-analytics-repository.ts"
import { createFakeMemoryAnalyticsRepository } from "../testing/index.ts"
import { getStoreInsightsUseCase } from "./get-store-insights.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const traceId = TraceId("t".repeat(32))
const base = new Date("2026-06-01T12:00:00.000Z").getTime()
const at = (seconds: number) => new Date(base + seconds * 1000)
const from = at(0)
const to = at(100)

type Fake = ReturnType<typeof createFakeMemoryAnalyticsRepository>

let spanCounter = 0
const nextSpan = () => {
  spanCounter += 1
  return SpanId(String(spanCounter).padStart(16, "0"))
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

const read = (o: Partial<MemoryEvent>): MemoryEvent =>
  makeEvent({ changeKind: "read", operation: "search_memory", ...o })

const makeCurrent = (o: Partial<MemoryCurrentEntry> = {}): MemoryCurrentEntry => ({
  organizationId,
  projectId,
  storeId: "A",
  recordId: "rec1",
  contentHash: "hash-a",
  changeKind: "add",
  tokenCount: 10,
  spanId: SpanId("0".repeat(16)),
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

const run = (memory: Fake, storeId = "A", listLimit = 10, bucketSeconds = 1) =>
  Effect.runPromise(
    getStoreInsightsUseCase({ organizationId, projectId, storeId, from, to, listLimit, bucketSeconds }).pipe(
      Effect.provide(layerFor(memory)),
    ),
  )

describe("getStoreInsightsUseCase", () => {
  const seededStore = (): Fake => {
    const memory = createFakeMemoryAnalyticsRepository()
    memory.events.push(
      makeEvent({ recordId: "rec1", contentHash: "hash-a", tokenCount: 10, endTime: at(0) }),
      makeEvent({ recordId: "rec2", contentHash: "hash-b", tokenCount: 600, endTime: at(1) }),
      makeEvent({ recordId: "rec3", contentHash: "hash-c", tokenCount: 50, endTime: at(2) }),
      read({ recordId: "rec3", tokenCount: 50, recordCount: 1, queryText: "old query", endTime: at(20) }),
      read({ recordId: "", tokenCount: 0, recordCount: 0, queryText: "missing", endTime: at(30) }),
      read({ recordId: "", tokenCount: 0, recordCount: 0, queryText: "missing", endTime: at(40) }),
      read({ recordId: "rec1", tokenCount: 10, recordCount: 1, queryText: "how to X", endTime: at(50) }),
      read({ recordId: "rec1", tokenCount: 10, recordCount: 1, queryText: "how to X", endTime: at(60) }),
      read({ recordId: "rec1", tokenCount: 10, recordCount: 1, queryText: "how to X", endTime: at(70) }),
    )
    memory.current.push(
      makeCurrent({ recordId: "rec1", contentHash: "hash-a", tokenCount: 10, endTime: at(0) }),
      makeCurrent({ recordId: "rec2", contentHash: "hash-b", tokenCount: 600, endTime: at(1) }),
      makeCurrent({ recordId: "rec3", contentHash: "hash-c", tokenCount: 50, endTime: at(2) }),
    )
    return memory
  }

  it("ranks most-read records by retrieval count, excluding never-read ones", async () => {
    const insights = await run(seededStore())
    expect(insights.mostReadRecords).toEqual([
      { recordId: "rec1", reads: 3 },
      { recordId: "rec3", reads: 1 },
    ])
  })

  it("orders cold storage by oldest activity — read or write — ignoring never-read", async () => {
    const memory = createFakeMemoryAnalyticsRepository()
    memory.events.push(
      makeEvent({ recordId: "stale", contentHash: "h-stale", tokenCount: 10, endTime: at(10) }),
      makeEvent({ recordId: "old-read", contentHash: "h-oldread", tokenCount: 20, endTime: at(0) }),
      makeEvent({ recordId: "fresh-write", contentHash: "h-fresh", tokenCount: 30, endTime: at(80) }),
      read({ recordId: "old-read", tokenCount: 20, recordCount: 1, queryText: "q", endTime: at(40) }),
    )
    memory.current.push(
      makeCurrent({ recordId: "stale", contentHash: "h-stale", tokenCount: 10, endTime: at(10) }),
      makeCurrent({ recordId: "old-read", contentHash: "h-oldread", tokenCount: 20, endTime: at(0) }),
      makeCurrent({ recordId: "fresh-write", contentHash: "h-fresh", tokenCount: 30, endTime: at(80) }),
    )
    const insights = await run(memory)
    expect(insights.coldRecords.map((row) => row.recordId)).toEqual(["stale", "old-read", "fresh-write"])
    expect(insights.coldRecords[1]).toMatchObject({
      recordId: "old-read",
      neverRead: false,
      lastReadAt: at(40).toISOString(),
    })
    expect(insights.coldRecords[2]).toMatchObject({ recordId: "fresh-write", neverRead: true })
  })

  it("counts top and zero-hit queries by distinct search span", async () => {
    const insights = await run(seededStore())
    expect(insights.topQueries).toEqual([
      { queryText: "how to X", searches: 3 },
      { queryText: "missing", searches: 2 },
      { queryText: "old query", searches: 1 },
    ])
    expect(insights.zeroHitQueries).toEqual([{ queryText: "missing", searches: 2 }])
  })

  it("ranks largest records and buckets the size distribution", async () => {
    const insights = await run(seededStore())
    expect(insights.largestRecords).toEqual([
      { recordId: "rec2", tokenCount: 600 },
      { recordId: "rec3", tokenCount: 50 },
      { recordId: "rec1", tokenCount: 10 },
    ])
    const sizeByLabel = Object.fromEntries(insights.sizeDistribution.map((bucket) => [bucket.label, bucket.count]))
    expect(sizeByLabel["<100"]).toBe(2)
    expect(sizeByLabel["500–1k"]).toBe(1)
  })

  it("builds a cumulative token-footprint history", async () => {
    const insights = await run(seededStore())
    expect(insights.tokenHistory.map((point) => point.tokens)).toEqual([10, 610, 660])
  })

  it("anchors token history to the current footprint, folding in untouched pre-window records", async () => {
    const memory = seededStore()
    // Live in current-state but with no event in the window (early history pruned / created earlier).
    memory.current.push(makeCurrent({ recordId: "ancient", contentHash: "h-old", tokenCount: 200, endTime: at(0) }))
    const insights = await run(memory)
    // Offset = liveTokens(860) − in-window delta(660) = 200, lifting every point so the series ends at 860.
    expect(insights.tokenHistory.map((point) => point.tokens)).toEqual([210, 810, 860])
  })

  it("scopes to the requested store", async () => {
    const memory = seededStore()
    memory.events.push(makeEvent({ storeId: "B", recordId: "other", tokenCount: 999, endTime: at(3) }))
    memory.current.push(makeCurrent({ storeId: "B", recordId: "other", tokenCount: 999, endTime: at(3) }))
    const insights = await run(memory, "A")
    expect(insights.largestRecords.map((row) => row.recordId)).not.toContain("other")
  })

  const writeHealthStore = (): Fake => {
    const memory = createFakeMemoryAnalyticsRepository()
    const t1 = TraceId("1".repeat(32))
    const t2 = TraceId("2".repeat(32))
    const t3 = TraceId("3".repeat(32))
    const t4 = TraceId("4".repeat(32))
    memory.events.push(
      // "hot": thrashed 3× in one trace, updated once more in another (distinct hashes → no revert)
      makeEvent({ recordId: "hot", contentHash: "h1", changeKind: "add", traceId: t1, endTime: at(0) }),
      makeEvent({ recordId: "hot", contentHash: "h2", changeKind: "update", traceId: t1, endTime: at(1) }),
      makeEvent({ recordId: "hot", contentHash: "h3", changeKind: "update", traceId: t1, endTime: at(2) }),
      makeEvent({ recordId: "hot", contentHash: "h4", changeKind: "update", traceId: t2, endTime: at(10) }),
      // "flip": A → B → A (reverted)
      makeEvent({ recordId: "flip", contentHash: "A", changeKind: "add", traceId: t3, endTime: at(3) }),
      makeEvent({ recordId: "flip", contentHash: "B", changeKind: "update", traceId: t3, endTime: at(4) }),
      makeEvent({ recordId: "flip", contentHash: "A", changeKind: "update", traceId: t3, endTime: at(5) }),
      // "noop": an update that did not change the body
      makeEvent({ recordId: "noop", contentHash: "N", changeKind: "add", traceId: t4, endTime: at(6) }),
      makeEvent({ recordId: "noop", contentHash: "N", changeKind: "update", traceId: t4, endTime: at(7) }),
      // two live records sharing one content hash (duplicates)
      makeEvent({ recordId: "dupA", contentHash: "shared", changeKind: "add", traceId: t4, endTime: at(8) }),
      makeEvent({ recordId: "dupB", contentHash: "shared", changeKind: "add", traceId: t4, endTime: at(9) }),
    )
    memory.current.push(
      makeCurrent({ recordId: "hot", contentHash: "h4", endTime: at(10) }),
      makeCurrent({ recordId: "flip", contentHash: "A", endTime: at(5) }),
      makeCurrent({ recordId: "noop", contentHash: "N", endTime: at(7) }),
      makeCurrent({ recordId: "dupA", contentHash: "shared", endTime: at(8) }),
      makeCurrent({ recordId: "dupB", contentHash: "shared", endTime: at(9) }),
    )
    return memory
  }

  it("reports write-health signals: writes, last write, no-ops, revert", async () => {
    const insights = await run(writeHealthStore())
    const byId = Object.fromEntries(insights.writeHealth.map((row) => [row.recordId, row]))
    expect(insights.writeHealth[0]?.recordId).toBe("hot")
    expect(byId.hot).toMatchObject({ writes: 4, lastWriteAt: at(10).toISOString(), noOps: 0, reverted: false })
    expect(byId.flip).toMatchObject({ writes: 3, lastWriteAt: at(5).toISOString(), noOps: 0, reverted: true })
    expect(byId.noop).toMatchObject({ writes: 2, lastWriteAt: at(7).toISOString(), noOps: 1, reverted: false })
  })

  it("counts thrash writes, no-op rewrites and duplicate records", async () => {
    const insights = await run(writeHealthStore())
    expect(insights.thrashWrites).toBe(5)
    expect(insights.noOpRewrites).toBe(1)
    expect(insights.duplicateGroups).toBe(1)
    expect(insights.duplicateRecords).toBe(2)
  })
})

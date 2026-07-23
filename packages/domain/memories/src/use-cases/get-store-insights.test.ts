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

const run = (memory: Fake, storeId = "A", listLimit = 10) =>
  Effect.runPromise(
    getStoreInsightsUseCase({ organizationId, projectId, storeId, from, to, listLimit }).pipe(
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

  it("orders cold storage never-read first, then oldest last-read", async () => {
    const insights = await run(seededStore())
    expect(insights.coldRecords.map((row) => row.recordId)).toEqual(["rec2", "rec3", "rec1"])
    expect(insights.coldRecords[0]).toMatchObject({ recordId: "rec2", neverRead: true, lastReadAt: null })
    expect(insights.coldRecords[2]).toMatchObject({ recordId: "rec1", neverRead: false })
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

  it("computes net token growth from the window boundaries", async () => {
    const insights = await run(seededStore())
    expect(insights.netGrowthTokens).toBe(650)
  })

  it("scopes to the requested store", async () => {
    const memory = seededStore()
    memory.events.push(makeEvent({ storeId: "B", recordId: "other", tokenCount: 999, endTime: at(3) }))
    memory.current.push(makeCurrent({ storeId: "B", recordId: "other", tokenCount: 999, endTime: at(3) }))
    const insights = await run(memory, "A")
    expect(insights.largestRecords.map((row) => row.recordId)).not.toContain("other")
  })
})

import type { MemoryAnalyticsRepositoryShape, MemoryCurrentEntry, MemoryEvent } from "@domain/memories"
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
import { beforeEach, describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { MemoryRepositoryLive } from "./memory-repository.ts"
import { MemoryAnalyticsRepositoryLive } from "./memory-analytics-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const base = new Date("2026-06-01T12:00:00.000Z").getTime()
const at = (seconds: number) => new Date(base + seconds * 1000)
const range = { from: at(-1000), to: at(1000) }
const spanN = (n: number) => SpanId(String(n).padStart(16, "0"))
const traceN = (n: number) => TraceId(String(n).padStart(32, "0"))

const ch = setupTestClickHouse()

let seq = 0
const makeEvent = (o: Partial<MemoryEvent> = {}): MemoryEvent => {
  const n = seq++
  return {
    organizationId,
    projectId,
    storeId: "store1",
    recordId: "rec1",
    operation: "create_memory",
    changeKind: "add",
    contentHash: "hash-a",
    tokenCount: 10,
    recordCount: 1,
    queryText: "",
    spanId: spanN(n),
    traceId: traceN(n),
    sessionId: SessionId("sess1"),
    userId: ExternalUserId("user1"),
    startTime: at(0),
    endTime: at(0),
    source: "otlp",
    ...o,
  }
}

const makeCurrent = (o: Partial<MemoryCurrentEntry> = {}): MemoryCurrentEntry => ({
  organizationId,
  projectId,
  storeId: "store1",
  recordId: "rec1",
  contentHash: "hash-a",
  changeKind: "add",
  tokenCount: 10,
  spanId: spanN(seq++),
  traceId: traceN(0),
  sessionId: SessionId("sess1"),
  endTime: at(0),
  ...o,
})

const withRepo = <A>(f: (repo: MemoryAnalyticsRepositoryShape) => Effect.Effect<A, RepositoryError, ChSqlClient>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* MemoryAnalyticsRepository
      return yield* f(repo)
    }).pipe(withClickHouse(MemoryAnalyticsRepositoryLive, ch.client, organizationId)),
  )

const seedEvents = (events: readonly MemoryEvent[]) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* MemoryRepository
      yield* repo.insertEvents(events)
    }).pipe(withClickHouse(MemoryRepositoryLive, ch.client, organizationId)),
  )

const seedCurrent = (entries: readonly MemoryCurrentEntry[]) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* MemoryRepository
      yield* repo.upsertCurrent(entries)
    }).pipe(withClickHouse(MemoryRepositoryLive, ch.client, organizationId)),
  )

beforeEach(() => {
  seq = 0
})

describe("MemoryAnalyticsRepository", () => {
  describe("getOverview", () => {
    it("reports live footprint with the never-read token share", async () => {
      await seedCurrent([
        makeCurrent({ recordId: "rec1", tokenCount: 30, endTime: at(0) }),
        makeCurrent({ recordId: "rec2", tokenCount: 70, endTime: at(0) }),
        makeCurrent({ recordId: "gone", changeKind: "remove", tokenCount: 0, endTime: at(1) }),
      ])
      // rec1 has been read; rec2 never; the removed record is excluded entirely.
      await seedEvents([makeEvent({ recordId: "rec1", changeKind: "read", tokenCount: 30, endTime: at(5) })])

      const overview = await withRepo((repo) => repo.getOverview({ organizationId, projectId, range }))
      expect(overview.liveRecords).toBe(2)
      expect(overview.liveTokens).toBe(100)
      expect(overview.neverReadLiveTokens).toBe(70)
    })

    it("counts searches and zero-hit searches distinctly, summing retrieved tokens", async () => {
      await seedEvents([
        // one search returning two records (shared span) + one zero-hit search
        makeEvent({ changeKind: "read", recordId: "rec1", recordCount: 2, tokenCount: 10, spanId: spanN(100), endTime: at(2) }),
        makeEvent({ changeKind: "read", recordId: "rec2", recordCount: 2, tokenCount: 15, spanId: spanN(100), endTime: at(2) }),
        makeEvent({ changeKind: "read", recordId: "", recordCount: 0, tokenCount: 0, spanId: spanN(101), queryText: "missing", endTime: at(3) }),
      ])

      const overview = await withRepo((repo) => repo.getOverview({ organizationId, projectId, range }))
      expect(overview.searchCount).toBe(2)
      expect(overview.zeroHitSearchCount).toBe(1)
      expect(overview.retrievedTokens).toBe(25)
      expect(overview.readSessions).toBe(1)
    })

    it("computes write yield: completed versions consumed before being superseded", async () => {
      // rec1: add@0 (read@1 → consumed), update@2 (read@6 after next? no successor → pending, excluded)
      // rec2: add@0 (never read), update@4 (supersedes → rec2 add completed & unread)
      await seedEvents([
        makeEvent({ recordId: "rec1", changeKind: "add", contentHash: "a0", endTime: at(0) }),
        makeEvent({ recordId: "rec1", changeKind: "read", contentHash: "a0", tokenCount: 5, endTime: at(1) }),
        makeEvent({ recordId: "rec1", changeKind: "update", contentHash: "a1", endTime: at(2) }),
        makeEvent({ recordId: "rec2", changeKind: "add", contentHash: "b0", endTime: at(0) }),
        makeEvent({ recordId: "rec2", changeKind: "update", contentHash: "b1", endTime: at(4) }),
      ])

      const overview = await withRepo((repo) => repo.getOverview({ organizationId, projectId, range }))
      // completed = rec1.add (superseded@2) + rec2.add (superseded@4) = 2; rec1.update & rec2.update are pending
      expect(overview.completedVersions).toBe(2)
      // consumed = rec1.add only (read@1 in [0,2)); rec2.add never read
      expect(overview.consumedVersions).toBe(1)
    })

    it("classifies no-op writes (same hash as predecessor) apart from content writes", async () => {
      await seedEvents([
        makeEvent({ recordId: "rec1", changeKind: "add", contentHash: "a0", endTime: at(0) }),
        makeEvent({ recordId: "rec1", changeKind: "update", contentHash: "a0", endTime: at(2) }), // no-op
        makeEvent({ recordId: "rec1", changeKind: "update", contentHash: "a1", endTime: at(4) }), // content change
      ])

      const overview = await withRepo((repo) => repo.getOverview({ organizationId, projectId, range }))
      expect(overview.noopWrites).toBe(1)
      expect(overview.contentWrites).toBe(2)
    })

    it("dedups retried projection rows in additive aggregates", async () => {
      const dup = makeEvent({ changeKind: "read", recordId: "rec1", recordCount: 1, tokenCount: 10, spanId: spanN(200), traceId: traceN(200), endTime: at(2) })
      await seedEvents([dup, { ...dup }, { ...dup }])

      const overview = await withRepo((repo) => repo.getOverview({ organizationId, projectId, range }))
      expect(overview.retrievedTokens).toBe(10)
      expect(overview.searchCount).toBe(1)
    })
  })

  describe("getActivityHistogram", () => {
    it("buckets mutations and reads by kind", async () => {
      await seedEvents([
        makeEvent({ recordId: "rec1", changeKind: "add", endTime: at(0) }),
        makeEvent({ recordId: "rec2", changeKind: "add", endTime: at(1) }),
        makeEvent({ recordId: "rec1", changeKind: "update", endTime: at(2) }),
        makeEvent({ recordId: "rec2", changeKind: "remove", contentHash: "", endTime: at(3) }),
        makeEvent({ changeKind: "read", recordId: "rec1", tokenCount: 5, endTime: at(4) }),
      ])

      const buckets = await withRepo((repo) =>
        repo.getActivityHistogram({ organizationId, projectId, range, bucketSeconds: 3600 }),
      )
      const totals = buckets.reduce(
        (acc, b) => ({
          adds: acc.adds + b.adds,
          updates: acc.updates + b.updates,
          removes: acc.removes + b.removes,
          reads: acc.reads + b.reads,
        }),
        { adds: 0, updates: 0, removes: 0, reads: 0 },
      )
      expect(totals).toEqual({ adds: 2, updates: 1, removes: 1, reads: 1 })
    })
  })

  describe("listStoresWithMetrics", () => {
    it("returns per-store metrics with write yield and net token growth, sorted", async () => {
      await seedCurrent([
        makeCurrent({ storeId: "alpha", recordId: "r1", tokenCount: 40, endTime: at(4) }),
        makeCurrent({ storeId: "beta", recordId: "r1", tokenCount: 10, endTime: at(2) }),
      ])
      await seedEvents([
        // alpha: add@0 (10 tok) → update@4 (40 tok); the add is completed, read@1 → consumed
        makeEvent({ storeId: "alpha", recordId: "r1", changeKind: "add", contentHash: "a0", tokenCount: 10, endTime: at(0) }),
        makeEvent({ storeId: "alpha", recordId: "r1", changeKind: "read", contentHash: "a0", tokenCount: 10, sessionId: SessionId("sA"), endTime: at(1) }),
        makeEvent({ storeId: "alpha", recordId: "r1", changeKind: "update", contentHash: "a1", tokenCount: 40, endTime: at(4) }),
        // beta: single add, pending (no successor), 10 tok
        makeEvent({ storeId: "beta", recordId: "r1", changeKind: "add", contentHash: "b0", tokenCount: 10, endTime: at(2) }),
      ])

      const page = await withRepo((repo) =>
        repo.listStoresWithMetrics({
          organizationId,
          projectId,
          range,
          options: { sortBy: "tokens", sortDirection: "desc" },
        }),
      )
      expect(page.items.map((i) => i.storeId)).toEqual(["alpha", "beta"])
      const alpha = page.items[0]!
      expect(alpha.completedVersions).toBe(1)
      expect(alpha.consumedVersions).toBe(1)
      expect(alpha.readSessions).toBe(1)
      expect(alpha.netTokenGrowth).toBe(40) // 0 before window → 40 at end
      const beta = page.items[1]!
      expect(beta.completedVersions).toBe(0)
      expect(beta.netTokenGrowth).toBe(10)
    })
  })

  describe("getStoreTrendBuckets", () => {
    it("buckets writes and reads per store", async () => {
      await seedEvents([
        makeEvent({ storeId: "alpha", recordId: "r1", changeKind: "add", endTime: at(0) }),
        makeEvent({ storeId: "alpha", recordId: "r1", changeKind: "read", tokenCount: 3, endTime: at(1) }),
      ])
      const trend = await withRepo((repo) =>
        repo.getStoreTrendBuckets({ organizationId, projectId, storeIds: ["alpha"], range, bucketSeconds: 3600 }),
      )
      const writes = trend.reduce((s, b) => s + b.writes, 0)
      const reads = trend.reduce((s, b) => s + b.reads, 0)
      expect(writes).toBe(1)
      expect(reads).toBe(1)
    })
  })

  describe("listZeroHitQueries", () => {
    it("groups zero-hit searches by query text, most frequent first", async () => {
      await seedEvents([
        makeEvent({ changeKind: "read", recordId: "", recordCount: 0, queryText: "how to X", spanId: spanN(1), endTime: at(1) }),
        makeEvent({ changeKind: "read", recordId: "", recordCount: 0, queryText: "how to X", spanId: spanN(2), endTime: at(2) }),
        makeEvent({ changeKind: "read", recordId: "", recordCount: 0, queryText: "rare", spanId: spanN(3), endTime: at(3) }),
        // a hit search must NOT appear
        makeEvent({ changeKind: "read", recordId: "rec1", recordCount: 1, queryText: "found", tokenCount: 5, spanId: spanN(4), endTime: at(4) }),
      ])
      const groups = await withRepo((repo) => repo.listZeroHitQueries({ organizationId, projectId, range }))
      expect(groups.map((g) => [g.queryText, g.searchCount])).toEqual([
        ["how to X", 2],
        ["rare", 1],
      ])
    })
  })
})

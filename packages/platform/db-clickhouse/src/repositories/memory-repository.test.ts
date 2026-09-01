import type {
  MemoryBlob,
  MemoryCurrentEntry,
  MemoryEvent,
  MemoryRepositoryShape,
  MemoryStoreListOptions,
} from "@domain/memories"
import { MemoryRepository } from "@domain/memories"
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
import { MemoryRepositoryLive } from "./memory-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const spanId = SpanId("s".repeat(16))
const traceId = TraceId("t".repeat(32))
const base = new Date("2026-06-01T12:00:00.000Z").getTime()
const at = (seconds: number) => new Date(base + seconds * 1000)
const spanN = (n: number) => SpanId(String(n).padStart(16, "0"))
const traceN = (n: number) => TraceId(String(n).padStart(32, "0"))

const ch = setupTestClickHouse()

const withRepo = <A>(f: (repo: MemoryRepositoryShape) => Effect.Effect<A, RepositoryError, ChSqlClient>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* MemoryRepository
      return yield* f(repo)
    }).pipe(withClickHouse(MemoryRepositoryLive, ch.client, organizationId)),
  )

const makeEvent = (o: Partial<MemoryEvent> = {}): MemoryEvent => ({
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
  spanId,
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
  storeId: "store1",
  recordId: "rec1",
  contentHash: "hash-a",
  changeKind: "add",
  tokenCount: 10,
  spanId,
  traceId,
  sessionId: SessionId("sess1"),
  endTime: at(0),
  ...o,
})

const makeBlob = (o: Partial<MemoryBlob> = {}): MemoryBlob => ({
  organizationId,
  contentHash: "hash-a",
  content: "the body",
  contentFileKey: "",
  byteSize: 8,
  tokenCount: 2,
  ...o,
})

const sortedIds = (versions: readonly { readonly recordId: string }[]) => versions.map((v) => v.recordId).sort()

describe("MemoryRepository", () => {
  it("dedups identical blob bodies to one row per (org, content_hash)", async () => {
    await withRepo((repo) => repo.upsertBlobs([makeBlob(), makeBlob(), makeBlob({ contentHash: "hash-b" })]))

    const count = await Effect.runPromise(
      Effect.tryPromise(async () => {
        const result = await ch.client.query({
          query: `SELECT content_hash, count() AS n FROM memory_blobs FINAL
                  WHERE organization_id = {organizationId:String}
                  GROUP BY content_hash ORDER BY content_hash`,
          query_params: { organizationId: organizationId as string },
          format: "JSONEachRow",
        })
        return result.json<{ content_hash: string; n: string | number }>()
      }),
    )

    expect(count.map((r) => [r.content_hash, Number(r.n)])).toEqual([
      ["hash-a", 1],
      ["hash-b", 1],
    ])
  })

  it("reconstructs the ledger manifest at a point in time (argMax by end_time, removes dropped)", async () => {
    // rec1: add@t0, update@t3 · rec2: add@t2, remove@t4
    await withRepo((repo) =>
      repo.insertEvents([
        makeEvent({ recordId: "rec1", changeKind: "add", contentHash: "a0", endTime: at(0) }),
        makeEvent({ recordId: "rec2", changeKind: "add", contentHash: "b0", endTime: at(2) }),
        makeEvent({ recordId: "rec1", changeKind: "update", contentHash: "a1", endTime: at(3) }),
        makeEvent({ recordId: "rec2", changeKind: "remove", contentHash: "", endTime: at(4) }),
      ]),
    )

    const atT2 = await withRepo((repo) =>
      repo.readManifestAt({ organizationId, projectId, storeId: "store1", at: at(2) }),
    )
    expect(sortedIds(atT2)).toEqual(["rec1", "rec2"])

    const atT5 = await withRepo((repo) =>
      repo.readManifestAt({ organizationId, projectId, storeId: "store1", at: at(5) }),
    )
    expect(sortedIds(atT5)).toEqual(["rec1"])
    expect(atT5[0]?.contentHash).toBe("a1")
  })

  it("reads the current snapshot from memory_current, dropping removed records", async () => {
    await withRepo((repo) =>
      repo.upsertCurrent([
        makeCurrent({ recordId: "rec1", changeKind: "update", contentHash: "a1", endTime: at(3) }),
        makeCurrent({ recordId: "rec2", changeKind: "remove", contentHash: "", endTime: at(4) }),
      ]),
    )

    const snapshot = await withRepo((repo) =>
      repo.readCurrentSnapshot({ organizationId, projectId, storeId: "store1" }),
    )
    expect(sortedIds(snapshot)).toEqual(["rec1"])
    expect(snapshot[0]?.contentHash).toBe("a1")
    expect(snapshot[0]?.spanId).toBe(spanId)
  })

  it("reports the latest whole-store wipe time per store as of T", async () => {
    await withRepo((repo) =>
      repo.insertEvents([
        makeEvent({ storeId: "store1", recordId: "", changeKind: "store_delete", endTime: at(10) }),
        makeEvent({ storeId: "store1", recordId: "", changeKind: "store_delete", endTime: at(20) }),
      ]),
    )

    const wipes = await withRepo((repo) =>
      repo.readLatestStoreWipes({ organizationId, projectId, storeId: "store1", at: at(30) }),
    )
    expect(wipes).toHaveLength(1)
    expect(wipes[0]?.storeId).toBe("store1")
    expect(wipes[0]?.endTime.getTime()).toBe(at(20).getTime())
  })

  it("reads blob bodies by hash, ignoring empty and unknown hashes", async () => {
    await withRepo((repo) =>
      repo.upsertBlobs([
        makeBlob({ contentHash: "h1", content: "one" }),
        makeBlob({ contentHash: "h2", content: "two" }),
      ]),
    )

    const got = await withRepo((repo) => repo.readBlobs({ organizationId, hashes: ["h1", "", "missing", "h2"] }))
    expect(got.map((b) => [b.contentHash, b.content]).sort()).toEqual([
      ["h1", "one"],
      ["h2", "two"],
    ])
  })

  it("reads a session's events (deduped, end_time then start_time ASC) and filters by trace", async () => {
    await withRepo((repo) =>
      repo.insertEvents([
        makeEvent({
          recordId: "rec1",
          spanId: spanN(1),
          traceId: traceN(1),
          sessionId: SessionId("sessA"),
          endTime: at(1),
        }),
        // retried projection duplicate of the same (span, store, record)
        makeEvent({
          recordId: "rec1",
          spanId: spanN(1),
          traceId: traceN(1),
          sessionId: SessionId("sessA"),
          endTime: at(1),
        }),
        makeEvent({
          recordId: "rec2",
          spanId: spanN(2),
          traceId: traceN(2),
          sessionId: SessionId("sessA"),
          endTime: at(3),
        }),
        makeEvent({
          recordId: "rec3",
          spanId: spanN(3),
          traceId: traceN(9),
          sessionId: SessionId("sessB"),
          endTime: at(5),
        }),
      ]),
    )

    const all = await withRepo((repo) =>
      repo.readSessionMemoryEvents({ organizationId, projectId, sessionId: SessionId("sessA") }),
    )
    expect(all.map((e) => e.recordId)).toEqual(["rec1", "rec2"])
    expect(all.map((e) => e.spanId)).toEqual([spanN(1), spanN(2)])

    const oneTrace = await withRepo((repo) =>
      repo.readSessionMemoryEvents({ organizationId, projectId, sessionId: SessionId("sessA"), traceId: traceN(1) }),
    )
    expect(oneTrace.map((e) => e.recordId)).toEqual(["rec1"])
  })

  it("keeps same span_id rows from different traces when reading a session", async () => {
    const sharedSpan = SpanId("sharedspan000001")
    await withRepo((repo) =>
      repo.insertEvents([
        makeEvent({
          recordId: "recA",
          spanId: sharedSpan,
          traceId: traceN(1),
          sessionId: SessionId("sessA"),
          endTime: at(1),
        }),
        makeEvent({
          recordId: "recB",
          spanId: sharedSpan,
          traceId: traceN(2),
          sessionId: SessionId("sessA"),
          endTime: at(2),
        }),
      ]),
    )

    const events = await withRepo((repo) =>
      repo.readSessionMemoryEvents({ organizationId, projectId, sessionId: SessionId("sessA") }),
    )
    expect(events.map((e) => e.recordId)).toEqual(["recA", "recB"])
    expect(events.map((e) => e.traceId)).toEqual([traceN(1), traceN(2)])
  })

  it("orders same-end_time session events by start_time, not insert order or span_id", async () => {
    await withRepo((repo) =>
      repo.insertEvents([
        makeEvent({
          recordId: "",
          changeKind: "store_delete",
          spanId: spanN(1),
          sessionId: SessionId("sessA"),
          startTime: at(1),
          endTime: at(1),
        }),
        makeEvent({
          recordId: "rec1",
          changeKind: "add",
          spanId: spanN(9),
          sessionId: SessionId("sessA"),
          startTime: at(0),
          endTime: at(1),
        }),
      ]),
    )

    const createThenWipe = await withRepo((repo) =>
      repo.readSessionMemoryEvents({ organizationId, projectId, sessionId: SessionId("sessA") }),
    )
    expect(createThenWipe.map((event) => event.changeKind)).toEqual(["add", "store_delete"])

    await withRepo((repo) =>
      repo.insertEvents([
        makeEvent({
          recordId: "rec2",
          changeKind: "add",
          spanId: spanN(8),
          sessionId: SessionId("sessB"),
          startTime: at(1),
          endTime: at(1),
        }),
        makeEvent({
          recordId: "",
          changeKind: "store_delete",
          spanId: spanN(2),
          sessionId: SessionId("sessB"),
          startTime: at(0),
          endTime: at(1),
        }),
      ]),
    )

    const wipeThenCreate = await withRepo((repo) =>
      repo.readSessionMemoryEvents({ organizationId, projectId, sessionId: SessionId("sessB") }),
    )
    expect(wipeThenCreate.map((event) => event.changeKind)).toEqual(["store_delete", "add"])
  })

  it("reads mutating version chains for the requested record set, honoring `at` and exact pairs", async () => {
    await withRepo((repo) =>
      repo.insertEvents([
        makeEvent({
          storeId: "store1",
          recordId: "recA",
          spanId: spanN(1),
          changeKind: "add",
          contentHash: "a0",
          endTime: at(0),
        }),
        makeEvent({
          storeId: "store1",
          recordId: "recA",
          spanId: spanN(2),
          changeKind: "update",
          contentHash: "a1",
          endTime: at(3),
        }),
        makeEvent({
          storeId: "store2",
          recordId: "recB",
          spanId: spanN(3),
          changeKind: "add",
          contentHash: "b0",
          endTime: at(2),
        }),
        // matches the IN cross-product (store1 × recB) but is not a requested pair
        makeEvent({
          storeId: "store1",
          recordId: "recB",
          spanId: spanN(4),
          changeKind: "add",
          contentHash: "x0",
          endTime: at(1),
        }),
        // reads never enter a version chain
        makeEvent({
          storeId: "store1",
          recordId: "recA",
          spanId: spanN(5),
          changeKind: "read",
          contentHash: "",
          endTime: at(4),
        }),
      ]),
    )

    const records = [
      { storeId: "store1", recordId: "recA" },
      { storeId: "store2", recordId: "recB" },
    ]
    const chain = await withRepo((repo) => repo.readRecordVersions({ organizationId, projectId, records }))
    expect(chain.map((v) => [v.storeId, v.recordId, v.contentHash])).toEqual([
      ["store1", "recA", "a0"],
      ["store1", "recA", "a1"],
      ["store2", "recB", "b0"],
    ])

    const bounded = await withRepo((repo) => repo.readRecordVersions({ organizationId, projectId, records, at: at(1) }))
    expect(bounded.map((v) => v.contentHash)).toEqual(["a0"])
  })
})

describe("MemoryRepository store listing", () => {
  const storesById = async () => {
    const page = await withRepo((repo) => repo.listStores({ organizationId, projectId }))
    return new Map(page.items.map((s) => [s.storeId, s]))
  }

  it("rolls up per-store metrics: live records/tokens/lastUpdated + event sessions/users/lastRead", async () => {
    await withRepo((repo) =>
      repo.upsertCurrent([
        makeCurrent({ recordId: "rec1", tokenCount: 10, endTime: at(1) }),
        makeCurrent({ recordId: "rec2", tokenCount: 15, endTime: at(3) }),
        makeCurrent({ recordId: "rec3", changeKind: "remove", tokenCount: 0, endTime: at(4) }),
      ]),
    )
    await withRepo((repo) =>
      repo.insertEvents([
        makeEvent({
          spanId: spanN(1),
          recordId: "rec1",
          sessionId: SessionId("s1"),
          userId: ExternalUserId("u1"),
          endTime: at(1),
        }),
        makeEvent({
          spanId: spanN(2),
          recordId: "rec2",
          sessionId: SessionId("s2"),
          userId: ExternalUserId("u2"),
          endTime: at(3),
        }),
        makeEvent({
          spanId: spanN(3),
          recordId: "rec1",
          changeKind: "read",
          sessionId: SessionId("s3"),
          userId: ExternalUserId("u3"),
          endTime: at(9),
        }),
        // anonymous read: advances lastRead, excluded from distinct counts
        makeEvent({
          spanId: spanN(4),
          recordId: "rec1",
          changeKind: "read",
          sessionId: SessionId(""),
          userId: ExternalUserId(""),
          endTime: at(20),
        }),
      ]),
    )
    const store = (await storesById()).get("store1")!
    expect(store.recordCount).toBe(2)
    expect(store.tokenCount).toBe(25)
    expect(store.lastUpdatedAt.getTime()).toBe(at(3).getTime())
    expect(store.sessionCount).toBe(3)
    expect(store.userCount).toBe(3)
    expect(store.lastReadAt?.getTime()).toBe(at(20).getTime())
  })

  it("lists the '' store and a live-but-eventless store; omits a store with no live records", async () => {
    await withRepo((repo) =>
      repo.upsertCurrent([
        makeCurrent({ storeId: "", recordId: "r1", endTime: at(1) }),
        makeCurrent({ storeId: "eventless", recordId: "r1", endTime: at(2) }),
        makeCurrent({ storeId: "gone", recordId: "g1", changeKind: "remove", endTime: at(2) }),
      ]),
    )
    await withRepo((repo) =>
      repo.insertEvents([makeEvent({ storeId: "gone", recordId: "g1", spanId: spanN(1), endTime: at(1) })]),
    )
    const byId = await storesById()
    expect([...byId.keys()].sort()).toEqual(["", "eventless"])
    const eventless = byId.get("eventless")!
    expect(eventless.sessionCount).toBe(0)
    expect(eventless.userCount).toBe(0)
    expect(eventless.lastReadAt).toBeNull()
  })

  const seedThreeStores = async () => {
    await withRepo((repo) =>
      repo.upsertCurrent([
        makeCurrent({ storeId: "A", recordId: "r1", tokenCount: 100, endTime: at(10) }),
        makeCurrent({ storeId: "B", recordId: "r1", tokenCount: 20, endTime: at(15) }),
        makeCurrent({ storeId: "B", recordId: "r2", tokenCount: 20, endTime: at(20) }),
        makeCurrent({ storeId: "B", recordId: "r3", tokenCount: 10, endTime: at(18) }),
        makeCurrent({ storeId: "C", recordId: "r1", tokenCount: 150, endTime: at(3) }),
        makeCurrent({ storeId: "C", recordId: "r2", tokenCount: 50, endTime: at(5) }),
      ]),
    )
    await withRepo((repo) =>
      repo.insertEvents([
        makeEvent({
          storeId: "A",
          recordId: "r1",
          spanId: spanN(1),
          sessionId: SessionId("s1"),
          userId: ExternalUserId("u1"),
          endTime: at(10),
        }),
        makeEvent({
          storeId: "A",
          recordId: "r1",
          spanId: spanN(2),
          changeKind: "read",
          sessionId: SessionId("s1"),
          userId: ExternalUserId("u1"),
          endTime: at(50),
        }),
        makeEvent({
          storeId: "B",
          recordId: "r1",
          spanId: spanN(3),
          sessionId: SessionId("s1"),
          userId: ExternalUserId("u1"),
          endTime: at(15),
        }),
        makeEvent({
          storeId: "B",
          recordId: "r2",
          spanId: spanN(4),
          sessionId: SessionId("s2"),
          userId: ExternalUserId("u2"),
          endTime: at(20),
        }),
        makeEvent({
          storeId: "B",
          recordId: "r3",
          spanId: spanN(5),
          sessionId: SessionId("s3"),
          userId: ExternalUserId("u1"),
          endTime: at(18),
        }),
        makeEvent({
          storeId: "C",
          recordId: "r1",
          spanId: spanN(6),
          sessionId: SessionId("s1"),
          userId: ExternalUserId("u1"),
          endTime: at(3),
        }),
        makeEvent({
          storeId: "C",
          recordId: "r2",
          spanId: spanN(7),
          sessionId: SessionId("s2"),
          userId: ExternalUserId("u2"),
          endTime: at(5),
        }),
        makeEvent({
          storeId: "C",
          recordId: "r2",
          spanId: spanN(8),
          changeKind: "read",
          sessionId: SessionId("s2"),
          userId: ExternalUserId("u3"),
          endTime: at(30),
        }),
      ]),
    )
  }

  const order = (options?: MemoryStoreListOptions) =>
    withRepo((repo) => repo.listStores({ organizationId, projectId, ...(options ? { options } : {}) })).then((page) =>
      page.items.map((s) => s.storeId),
    )

  it("sorts server-side by the requested column and direction, tie-broken on store_id", async () => {
    await seedThreeStores()
    // A: 1 rec/updated@10/1 user/read@50 · B: 3 rec/updated@20/2 user/never read · C: 2 rec/updated@5/3 user/read@30
    expect(await order()).toEqual(["B", "A", "C"]) // default lastUpdated desc
    expect(await order({ sortBy: "records", sortDirection: "desc" })).toEqual(["B", "C", "A"])
    expect(await order({ sortBy: "users", sortDirection: "desc" })).toEqual(["C", "B", "A"])
    expect(await order({ sortBy: "lastRead", sortDirection: "desc" })).toEqual(["A", "C", "B"]) // never-read last
  })

  it("paginates with limit/offset and a stable total count", async () => {
    await withRepo((repo) =>
      repo.upsertCurrent(
        Array.from({ length: 5 }, (_, i) => makeCurrent({ storeId: `store${i}`, recordId: "r1", endTime: at(i) })),
      ),
    )
    const p0 = await withRepo((repo) =>
      repo.listStores({
        organizationId,
        projectId,
        options: { limit: 2, offset: 0, sortBy: "lastUpdated", sortDirection: "asc" },
      }),
    )
    expect(p0.items.map((s) => s.storeId)).toEqual(["store0", "store1"])
    expect(p0.hasMore).toBe(true)
    expect(p0.totalCount).toBe(5)
    const p2 = await withRepo((repo) =>
      repo.listStores({
        organizationId,
        projectId,
        options: { limit: 2, offset: 4, sortBy: "lastUpdated", sortDirection: "asc" },
      }),
    )
    expect(p2.items.map((s) => s.storeId)).toEqual(["store4"])
    expect(p2.hasMore).toBe(false)
    expect(p2.totalCount).toBe(5)
  })

  it("does not double-count a retried duplicate event", async () => {
    const dup = makeEvent({
      changeKind: "read",
      sessionId: SessionId("s1"),
      userId: ExternalUserId("u1"),
      endTime: at(9),
    })
    await withRepo((repo) => repo.upsertCurrent([makeCurrent({ endTime: at(1) })]))
    await withRepo((repo) => repo.insertEvents([dup, dup]))
    const store = (await storesById()).get("store1")!
    expect(store.sessionCount).toBe(1)
    expect(store.userCount).toBe(1)
    expect(store.lastReadAt?.getTime()).toBe(at(9).getTime())
  })

  it("lists distinct users of a store (reads count, '' excluded) and distinct stores of a user ('' kept)", async () => {
    await withRepo((repo) =>
      repo.insertEvents([
        makeEvent({ storeId: "s", recordId: "r1", spanId: spanN(1), userId: ExternalUserId("u1"), endTime: at(1) }),
        makeEvent({
          storeId: "s",
          recordId: "r1",
          spanId: spanN(2),
          changeKind: "read",
          userId: ExternalUserId("u1"),
          endTime: at(5),
        }),
        makeEvent({
          storeId: "s",
          recordId: "r2",
          spanId: spanN(3),
          changeKind: "read",
          userId: ExternalUserId("u2"),
          endTime: at(9),
        }),
        makeEvent({ storeId: "s", recordId: "r3", spanId: spanN(4), userId: ExternalUserId(""), endTime: at(3) }),
        makeEvent({ storeId: "", recordId: "r1", spanId: spanN(5), userId: ExternalUserId("u1"), endTime: at(4) }),
        makeEvent({ storeId: "other", recordId: "r1", spanId: spanN(6), userId: ExternalUserId("u3"), endTime: at(2) }),
      ]),
    )
    const users = await withRepo((repo) => repo.listStoreUsers({ organizationId, projectId, storeId: "s" }))
    expect(users.map((u) => u.userId as string)).toEqual(["u2", "u1"])
    expect(users[0]!.lastAccessedAt.getTime()).toBe(at(9).getTime())

    const stores = await withRepo((repo) =>
      repo.listUserStores({ organizationId, projectId, userId: ExternalUserId("u1") }),
    )
    expect(stores.map((s) => s.storeId)).toEqual(["s", ""])
    expect(stores[0]!.lastAccessedAt.getTime()).toBe(at(5).getTime())
  })
})

describe("MemoryRepository record activity", () => {
  it("reads one record's retrieval events, newest first, deduped, capped by limit", async () => {
    const dupRead = makeEvent({
      recordId: "recA",
      spanId: spanN(1),
      changeKind: "read",
      queryText: "q1",
      userId: ExternalUserId("u1"),
      tokenCount: 5,
      endTime: at(2),
    })
    await withRepo((repo) =>
      repo.insertEvents([
        dupRead,
        dupRead,
        makeEvent({
          recordId: "recA",
          spanId: spanN(2),
          changeKind: "read",
          queryText: "q2",
          userId: ExternalUserId("u2"),
          endTime: at(5),
        }),
        makeEvent({ recordId: "recA", spanId: spanN(3), changeKind: "add", endTime: at(1) }),
        makeEvent({ recordId: "recB", spanId: spanN(4), changeKind: "read", queryText: "other", endTime: at(9) }),
      ]),
    )
    const reads = await withRepo((repo) =>
      repo.readRecordReadEvents({ organizationId, projectId, storeId: "store1", recordId: "recA" }),
    )
    expect(reads.map((r) => [r.queryText, r.userId as string])).toEqual([
      ["q2", "u2"],
      ["q1", "u1"],
    ])

    const limited = await withRepo((repo) =>
      repo.readRecordReadEvents({ organizationId, projectId, storeId: "store1", recordId: "recA", limit: 1 }),
    )
    expect(limited.map((r) => r.queryText)).toEqual(["q2"])
  })

  it("rolls up a record's users with read/write counts (deduped, '' excluded), newest access first", async () => {
    await withRepo((repo) =>
      repo.insertEvents([
        makeEvent({
          recordId: "recA",
          spanId: spanN(1),
          changeKind: "add",
          userId: ExternalUserId("u1"),
          endTime: at(1),
        }),
        makeEvent({
          recordId: "recA",
          spanId: spanN(2),
          changeKind: "read",
          userId: ExternalUserId("u1"),
          endTime: at(4),
        }),
        // retried duplicate of spanN(2) → counted once
        makeEvent({
          recordId: "recA",
          spanId: spanN(2),
          changeKind: "read",
          userId: ExternalUserId("u1"),
          endTime: at(4),
        }),
        makeEvent({
          recordId: "recA",
          spanId: spanN(3),
          changeKind: "read",
          userId: ExternalUserId("u1"),
          endTime: at(6),
        }),
        makeEvent({
          recordId: "recA",
          spanId: spanN(4),
          changeKind: "read",
          userId: ExternalUserId("u2"),
          endTime: at(9),
        }),
        makeEvent({
          recordId: "recA",
          spanId: spanN(5),
          changeKind: "update",
          userId: ExternalUserId(""),
          endTime: at(3),
        }),
        makeEvent({
          recordId: "recB",
          spanId: spanN(6),
          changeKind: "read",
          userId: ExternalUserId("u3"),
          endTime: at(20),
        }),
      ]),
    )
    const users = await withRepo((repo) =>
      repo.listRecordUsers({ organizationId, projectId, storeId: "store1", recordId: "recA" }),
    )
    expect(users.map((u) => [u.userId as string, u.readCount, u.writeCount])).toEqual([
      ["u2", 1, 0],
      ["u1", 2, 1],
    ])
    expect(users[0]!.lastAccessedAt.getTime()).toBe(at(9).getTime())
  })
})

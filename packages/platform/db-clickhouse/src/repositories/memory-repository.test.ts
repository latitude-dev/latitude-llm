import type { MemoryBlob, MemoryCurrentEntry, MemoryEvent, MemoryRepositoryShape } from "@domain/memories"
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
  scope: "u1",
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
  scope: "u1",
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

    const atT2 = await withRepo((repo) => repo.readManifestAt({ organizationId, projectId, scope: "u1", at: at(2) }))
    expect(sortedIds(atT2)).toEqual(["rec1", "rec2"])

    const atT5 = await withRepo((repo) => repo.readManifestAt({ organizationId, projectId, scope: "u1", at: at(5) }))
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

    const snapshot = await withRepo((repo) => repo.readCurrentSnapshot({ organizationId, projectId, scope: "u1" }))
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
      repo.readLatestStoreWipes({ organizationId, projectId, scope: "u1", at: at(30) }),
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

  it("reads a session's events (deduped, end_time ASC) and filters by trace", async () => {
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

  it("reads mutating version chains for the requested record set, honoring `at` and exact pairs", async () => {
    await withRepo((repo) =>
      repo.insertEvents([
        makeEvent({
          scope: "s",
          storeId: "store1",
          recordId: "recA",
          spanId: spanN(1),
          changeKind: "add",
          contentHash: "a0",
          endTime: at(0),
        }),
        makeEvent({
          scope: "s",
          storeId: "store1",
          recordId: "recA",
          spanId: spanN(2),
          changeKind: "update",
          contentHash: "a1",
          endTime: at(3),
        }),
        makeEvent({
          scope: "s",
          storeId: "store2",
          recordId: "recB",
          spanId: spanN(3),
          changeKind: "add",
          contentHash: "b0",
          endTime: at(2),
        }),
        // matches the IN cross-product (store1 × recB) but is not a requested pair
        makeEvent({
          scope: "s",
          storeId: "store1",
          recordId: "recB",
          spanId: spanN(4),
          changeKind: "add",
          contentHash: "x0",
          endTime: at(1),
        }),
        // reads never enter a version chain
        makeEvent({
          scope: "s",
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
    const chain = await withRepo((repo) => repo.readRecordVersions({ organizationId, projectId, scope: "s", records }))
    expect(chain.map((v) => [v.storeId, v.recordId, v.contentHash])).toEqual([
      ["store1", "recA", "a0"],
      ["store1", "recA", "a1"],
      ["store2", "recB", "b0"],
    ])

    const bounded = await withRepo((repo) =>
      repo.readRecordVersions({ organizationId, projectId, scope: "s", records, at: at(1) }),
    )
    expect(bounded.map((v) => v.contentHash)).toEqual(["a0"])
  })
})

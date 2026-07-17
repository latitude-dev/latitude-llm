import { ChSqlClient, ExternalUserId, OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { MemoryCurrentEntry } from "../entities/memory-current.ts"
import type { MemoryEvent } from "../entities/memory-event.ts"
import type { MemoryStoreListOptions } from "../entities/memory-store.ts"
import { MemoryRepository } from "../ports/memory-repository.ts"
import { createFakeMemoryRepository } from "../testing/index.ts"
import { listMemoryStoresUseCase } from "./list-memory-stores.ts"
import { listStoreUsersUseCase } from "./list-store-users.ts"
import { listUserStoresUseCase } from "./list-user-stores.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const spanId = SpanId("s".repeat(16))
const traceId = TraceId("t".repeat(32))
const base = new Date("2026-06-01T12:00:00.000Z").getTime()
const at = (seconds: number) => new Date(base + seconds * 1000)

type Fake = ReturnType<typeof createFakeMemoryRepository>

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

const layerFor = (memory: Fake) =>
  Layer.mergeAll(
    Layer.succeed(MemoryRepository, memory.repository),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
  )

const seed = (memory: Fake, events: readonly MemoryEvent[], current: readonly MemoryCurrentEntry[]) => {
  for (const event of events) memory.events.push(event)
  return Effect.runPromise(memory.repository.upsertCurrent(current).pipe(Effect.provide(layerFor(memory))))
}

const listStores = (memory: Fake, options?: MemoryStoreListOptions) =>
  Effect.runPromise(
    listMemoryStoresUseCase({ organizationId, projectId, options }).pipe(Effect.provide(layerFor(memory))),
  )

const listStoreUsers = (memory: Fake, storeId: string) =>
  Effect.runPromise(
    listStoreUsersUseCase({ organizationId, projectId, storeId }).pipe(Effect.provide(layerFor(memory))),
  )

const listUserStores = (memory: Fake, userId: string) =>
  Effect.runPromise(
    listUserStoresUseCase({ organizationId, projectId, userId: ExternalUserId(userId) }).pipe(
      Effect.provide(layerFor(memory)),
    ),
  )

describe("listMemoryStores", () => {
  it("rolls up records/tokens/lastUpdated from live rows and sessions/users/lastRead from events", async () => {
    const memory = createFakeMemoryRepository()
    await seed(
      memory,
      [
        // reads count toward session/user; empty ids are excluded
        makeEvent({
          recordId: "rec1",
          changeKind: "add",
          sessionId: SessionId("s1"),
          userId: ExternalUserId("u1"),
          endTime: at(1),
        }),
        makeEvent({
          recordId: "rec2",
          changeKind: "add",
          sessionId: SessionId("s2"),
          userId: ExternalUserId("u2"),
          endTime: at(3),
        }),
        makeEvent({
          recordId: "rec1",
          changeKind: "read",
          sessionId: SessionId("s3"),
          userId: ExternalUserId("u3"),
          endTime: at(9),
        }),
        // an anonymous read still advances lastReadAt but is excluded from the distinct counts
        makeEvent({
          recordId: "rec1",
          changeKind: "read",
          sessionId: SessionId(""),
          userId: ExternalUserId(""),
          endTime: at(20),
        }),
      ],
      [
        makeCurrent({ recordId: "rec1", tokenCount: 10, endTime: at(1) }),
        makeCurrent({ recordId: "rec2", tokenCount: 15, endTime: at(3) }),
        // a removed record is not live: excluded from record/token counts
        makeCurrent({ recordId: "rec3", changeKind: "remove", tokenCount: 0, endTime: at(4) }),
      ],
    )

    const page = await listStores(memory)
    expect(page.items).toHaveLength(1)
    const store = page.items[0]!
    expect(store.storeId).toBe("store1")
    expect(store.recordCount).toBe(2)
    expect(store.tokenCount).toBe(25)
    expect(store.lastUpdatedAt.getTime()).toBe(at(3).getTime())
    expect(store.sessionCount).toBe(3)
    expect(store.userCount).toBe(3)
    expect(store.lastReadAt?.getTime()).toBe(at(20).getTime())
    expect(page.totalCount).toBe(1)
  })

  it("returns null lastReadAt for a store that was never read", async () => {
    const memory = createFakeMemoryRepository()
    await seed(memory, [makeEvent({ changeKind: "add", endTime: at(1) })], [makeCurrent({ endTime: at(1) })])
    const page = await listStores(memory)
    expect(page.items[0]!.lastReadAt).toBeNull()
  })

  it("lists the unattributed '' store and a live-but-eventless store; hides a store with no live records", async () => {
    const memory = createFakeMemoryRepository()
    await seed(
      memory,
      [
        // events for a store whose records are all removed → not listed
        makeEvent({ storeId: "gone", recordId: "g1", changeKind: "add", endTime: at(1) }),
      ],
      [
        makeCurrent({ storeId: "", recordId: "r1", endTime: at(1) }),
        makeCurrent({ storeId: "eventless", recordId: "r1", endTime: at(2) }),
        makeCurrent({ storeId: "gone", recordId: "g1", changeKind: "remove", endTime: at(2) }),
      ],
    )
    const page = await listStores(memory)
    const byId = new Map(page.items.map((s) => [s.storeId, s]))
    expect([...byId.keys()].sort()).toEqual(["", "eventless"])
    expect(byId.get("eventless")!.sessionCount).toBe(0)
    expect(byId.get("eventless")!.userCount).toBe(0)
    expect(byId.get("eventless")!.lastReadAt).toBeNull()
  })

  const seedStores = (memory: Fake) =>
    seed(
      memory,
      [
        makeEvent({
          storeId: "A",
          recordId: "r1",
          sessionId: SessionId("s1"),
          userId: ExternalUserId("u1"),
          endTime: at(10),
        }),
        makeEvent({
          storeId: "A",
          recordId: "r1",
          changeKind: "read",
          sessionId: SessionId("s1"),
          userId: ExternalUserId("u1"),
          endTime: at(50),
        }),
        makeEvent({
          storeId: "B",
          recordId: "r1",
          sessionId: SessionId("s1"),
          userId: ExternalUserId("u1"),
          endTime: at(15),
        }),
        makeEvent({
          storeId: "B",
          recordId: "r2",
          sessionId: SessionId("s2"),
          userId: ExternalUserId("u2"),
          endTime: at(20),
        }),
        makeEvent({
          storeId: "B",
          recordId: "r3",
          sessionId: SessionId("s3"),
          userId: ExternalUserId("u1"),
          endTime: at(18),
        }),
        makeEvent({
          storeId: "C",
          recordId: "r1",
          sessionId: SessionId("s1"),
          userId: ExternalUserId("u1"),
          endTime: at(3),
        }),
        makeEvent({
          storeId: "C",
          recordId: "r2",
          sessionId: SessionId("s2"),
          userId: ExternalUserId("u2"),
          endTime: at(5),
        }),
        makeEvent({
          storeId: "C",
          recordId: "r2",
          changeKind: "read",
          sessionId: SessionId("s2"),
          userId: ExternalUserId("u3"),
          endTime: at(30),
        }),
      ],
      [
        makeCurrent({ storeId: "A", recordId: "r1", tokenCount: 100, endTime: at(10) }),
        makeCurrent({ storeId: "B", recordId: "r1", tokenCount: 20, endTime: at(15) }),
        makeCurrent({ storeId: "B", recordId: "r2", tokenCount: 20, endTime: at(20) }),
        makeCurrent({ storeId: "B", recordId: "r3", tokenCount: 10, endTime: at(18) }),
        makeCurrent({ storeId: "C", recordId: "r1", tokenCount: 150, endTime: at(3) }),
        makeCurrent({ storeId: "C", recordId: "r2", tokenCount: 50, endTime: at(5) }),
      ],
    )

  const order = (memory: Fake, options: MemoryStoreListOptions) =>
    listStores(memory, options).then((page) => page.items.map((s) => s.storeId))

  it("sorts server-side on each column, both directions", async () => {
    const memory = createFakeMemoryRepository()
    await seedStores(memory)
    // A: 1 rec/100 tok/updated@10/1 sess/1 user/read@50
    // B: 3 rec/50 tok/updated@20/3 sess/2 user/never read
    // C: 2 rec/200 tok/updated@5/2 sess/3 user/read@30
    expect(await order(memory, {})).toEqual(["B", "A", "C"]) // default lastUpdated desc
    expect(await order(memory, { sortBy: "records", sortDirection: "desc" })).toEqual(["B", "C", "A"])
    expect(await order(memory, { sortBy: "tokens", sortDirection: "asc" })).toEqual(["B", "A", "C"])
    expect(await order(memory, { sortBy: "users", sortDirection: "desc" })).toEqual(["C", "B", "A"])
    expect(await order(memory, { sortBy: "sessions", sortDirection: "asc" })).toEqual(["A", "C", "B"])
    expect(await order(memory, { sortBy: "lastRead", sortDirection: "desc" })).toEqual(["A", "C", "B"]) // never-read last
  })

  it("breaks ties on store_id ascending regardless of sort direction", async () => {
    const memory = createFakeMemoryRepository()
    await seed(
      memory,
      [],
      [
        makeCurrent({ storeId: "zzz", recordId: "r1", tokenCount: 5, endTime: at(1) }),
        makeCurrent({ storeId: "aaa", recordId: "r1", tokenCount: 5, endTime: at(1) }),
      ],
    )
    expect(await order(memory, { sortBy: "tokens", sortDirection: "desc" })).toEqual(["aaa", "zzz"])
    expect(await order(memory, { sortBy: "tokens", sortDirection: "asc" })).toEqual(["aaa", "zzz"])
  })

  it("paginates with a stable total count", async () => {
    const memory = createFakeMemoryRepository()
    await seed(
      memory,
      [],
      Array.from({ length: 5 }, (_, i) => makeCurrent({ storeId: `store${i}`, recordId: "r1", endTime: at(i) })),
    )
    const p0 = await listStores(memory, { limit: 2, offset: 0, sortBy: "lastUpdated", sortDirection: "asc" })
    expect(p0.items.map((s) => s.storeId)).toEqual(["store0", "store1"])
    expect(p0.hasMore).toBe(true)
    expect(p0.totalCount).toBe(5)
    const p2 = await listStores(memory, { limit: 2, offset: 4, sortBy: "lastUpdated", sortDirection: "asc" })
    expect(p2.items.map((s) => s.storeId)).toEqual(["store4"])
    expect(p2.hasMore).toBe(false)
    expect(p2.totalCount).toBe(5)
  })

  it("does not double-count a duplicated (retried) event", async () => {
    const memory = createFakeMemoryRepository()
    const dup = makeEvent({
      changeKind: "read",
      sessionId: SessionId("s1"),
      userId: ExternalUserId("u1"),
      endTime: at(9),
    })
    await seed(memory, [dup, dup], [makeCurrent({ endTime: at(1) })])
    const store = (await listStores(memory)).items[0]!
    expect(store.sessionCount).toBe(1)
    expect(store.userCount).toBe(1)
    expect(store.lastReadAt?.getTime()).toBe(at(9).getTime())
  })
})

describe("listStoreUsers", () => {
  it("lists distinct users of one store (reads count, '' excluded), newest-first", async () => {
    const memory = createFakeMemoryRepository()
    await seed(
      memory,
      [
        makeEvent({ storeId: "s", userId: ExternalUserId("u1"), changeKind: "add", endTime: at(1) }),
        makeEvent({ storeId: "s", userId: ExternalUserId("u1"), changeKind: "read", endTime: at(5) }),
        makeEvent({ storeId: "s", userId: ExternalUserId("u2"), changeKind: "read", endTime: at(9) }),
        makeEvent({ storeId: "s", userId: ExternalUserId(""), changeKind: "add", endTime: at(3) }),
        makeEvent({ storeId: "other", userId: ExternalUserId("u3"), changeKind: "add", endTime: at(2) }),
      ],
      [],
    )
    const users = await listStoreUsers(memory, "s")
    expect(users.map((u) => u.userId as string)).toEqual(["u2", "u1"])
    expect(users[0]!.lastAccessedAt.getTime()).toBe(at(9).getTime())
    expect(users[1]!.lastAccessedAt.getTime()).toBe(at(5).getTime())
  })
})

describe("listUserStores", () => {
  it("lists distinct stores one user touched (reads count, '' store kept), newest-first", async () => {
    const memory = createFakeMemoryRepository()
    await seed(
      memory,
      [
        makeEvent({ storeId: "store1", userId: ExternalUserId("u1"), changeKind: "add", endTime: at(1) }),
        makeEvent({ storeId: "store2", userId: ExternalUserId("u1"), changeKind: "read", endTime: at(9) }),
        makeEvent({ storeId: "", userId: ExternalUserId("u1"), changeKind: "add", endTime: at(4) }),
        makeEvent({ storeId: "store3", userId: ExternalUserId("u2"), changeKind: "add", endTime: at(2) }),
      ],
      [],
    )
    const stores = await listUserStores(memory, "u1")
    expect(stores.map((s) => s.storeId)).toEqual(["store2", "", "store1"])
  })
})

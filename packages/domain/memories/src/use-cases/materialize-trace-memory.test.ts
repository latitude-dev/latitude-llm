import { ChSqlClient, ExternalUserId, OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { type MemoryOperationSpan, SpanRepository } from "@domain/spans"
import { createFakeSpanRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { MemoryRepository } from "../ports/memory-repository.ts"
import { createFakeMemoryRepository } from "../testing/index.ts"
import { materializeTraceMemoryUseCase } from "./materialize-trace-memory.ts"
import { reconstructSnapshotUseCase } from "./reconstruct-snapshot.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const traceId = TraceId("t".repeat(32))
const base = new Date("2026-06-01T12:00:00.000Z").getTime()
const at = (seconds: number) => new Date(base + seconds * 1000)
const spanId = (char: string) => SpanId(char.repeat(16))
const records = (...items: { id: string; content: string; score?: number }[]) => JSON.stringify(items)

const makeSpan = (o: Partial<MemoryOperationSpan> = {}): MemoryOperationSpan => ({
  spanId: spanId("s"),
  traceId,
  sessionId: SessionId("sess1"),
  userId: ExternalUserId("user1"),
  operation: "create_memory",
  startTime: at(0),
  endTime: at(0),
  storeId: "store1",
  recordId: "",
  recordCount: 1,
  queryText: "",
  recordsRaw: "",
  scopeAttr: "",
  latitudeScopeAttr: "",
  ...o,
})

type Fake = ReturnType<typeof createFakeMemoryRepository>

const materialize = (spans: readonly MemoryOperationSpan[], memory: Fake) => {
  const spanRepo = createFakeSpanRepository({
    listMemoryOperationSpansByTraceId: () => Effect.succeed(spans),
  }).repository
  const layer = Layer.mergeAll(
    Layer.succeed(SpanRepository, spanRepo),
    Layer.succeed(MemoryRepository, memory.repository),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
  )
  return Effect.runPromise(
    materializeTraceMemoryUseCase({ organizationId, projectId, traceId }).pipe(Effect.provide(layer)),
  )
}

const reconstruct = (memory: Fake, scope: string, atTime?: Date) => {
  const layer = Layer.mergeAll(
    Layer.succeed(MemoryRepository, memory.repository),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
  )
  return Effect.runPromise(
    reconstructSnapshotUseCase({ organizationId, projectId, scope, ...(atTime ? { at: atTime } : {}) }).pipe(
      Effect.provide(layer),
    ),
  )
}

describe("materializeTraceMemory", () => {
  it("materializes create_memory records into add events with per-body blob dedup", async () => {
    const memory = createFakeMemoryRepository()
    const result = await materialize(
      [
        makeSpan({
          operation: "create_memory",
          recordCount: 3,
          recordsRaw: records(
            { id: "r1", content: "alpha" },
            { id: "r2", content: "beta" },
            { id: "r3", content: "alpha" },
          ),
        }),
      ],
      memory,
    )

    expect(result.eventCount).toBe(3)
    expect(result.blobCount).toBe(2) // "alpha" is stored once
    expect(memory.events.every((event) => event.changeKind === "add")).toBe(true)
    expect(memory.events.map((event) => event.recordId).sort()).toEqual(["r1", "r2", "r3"])
    const r1 = memory.events.find((event) => event.recordId === "r1")
    const r3 = memory.events.find((event) => event.recordId === "r3")
    expect(r1?.contentHash).toBe(r3?.contentHash)
    expect(r1?.tokenCount).toBeGreaterThan(0)
  })

  it("assigns synthetic record ids when a batch omits record ids", async () => {
    const memory = createFakeMemoryRepository()
    const span = makeSpan({
      operation: "create_memory",
      spanId: spanId("b"),
      recordCount: 2,
      recordsRaw: JSON.stringify([{ content: "alpha" }, { content: "beta" }]),
    })
    const result = await materialize([span], memory)

    expect(result.eventCount).toBe(2)
    expect(memory.events.map((event) => event.recordId).sort()).toEqual([`${span.spanId}:0`, `${span.spanId}:1`])
  })

  it("records search_memory as a read with a token count and no blobs", async () => {
    const memory = createFakeMemoryRepository()
    const result = await materialize(
      [
        makeSpan({
          operation: "search_memory",
          recordCount: 1,
          queryText: "find alpha",
          recordsRaw: records({ id: "r1", content: "alpha", score: 0.9 }),
        }),
      ],
      memory,
    )

    expect(result.eventCount).toBe(1)
    expect(result.blobCount).toBe(0)
    expect(memory.events[0]?.changeKind).toBe("read")
    expect(memory.events[0]?.queryText).toBe("find alpha")
    expect(memory.events[0]?.tokenCount).toBeGreaterThan(0)
  })

  it("resolves upsert to update for existing records and add for new ones", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({
          operation: "create_memory",
          recordsRaw: records({ id: "existing", content: "v1" }),
          endTime: at(0),
        }),
      ],
      memory,
    )
    await materialize(
      [
        makeSpan({
          spanId: spanId("u"),
          operation: "upsert_memory",
          recordCount: 2,
          recordsRaw: records({ id: "existing", content: "v2" }, { id: "fresh", content: "n1" }),
          endTime: at(5),
        }),
      ],
      memory,
    )

    const upsert = memory.events.filter((event) => event.spanId === spanId("u"))
    expect(Object.fromEntries(upsert.map((event) => [event.recordId, event.changeKind]))).toEqual({
      existing: "update",
      fresh: "add",
    })
  })

  it("records a whole-store wipe when delete_memory omits the record id", async () => {
    const memory = createFakeMemoryRepository()
    const result = await materialize([makeSpan({ operation: "delete_memory", recordId: "" })], memory)
    expect(result.eventCount).toBe(1)
    expect(memory.events[0]?.changeKind).toBe("store_delete")
    expect(memory.events[0]?.recordId).toBe("")
  })

  it("resolves scope from the scope attribute, else the user id, else empty", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({ spanId: spanId("a"), recordsRaw: records({ id: "r1", content: "x" }), scopeAttr: "team-x" }),
        makeSpan({ spanId: spanId("b"), storeId: "store2", recordsRaw: records({ id: "r2", content: "y" }) }),
        makeSpan({
          spanId: spanId("c"),
          storeId: "store3",
          recordsRaw: records({ id: "r3", content: "z" }),
          userId: ExternalUserId(""),
        }),
      ],
      memory,
    )

    expect(Object.fromEntries(memory.events.map((event) => [event.recordId, event.scope]))).toEqual({
      r1: "team-x",
      r2: "user1",
      r3: "",
    })
  })

  it("reconstructs current state and point-in-time, honoring removes", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({
          spanId: spanId("1"),
          operation: "create_memory",
          recordsRaw: records({ id: "rec1", content: "v1" }),
          endTime: at(0),
        }),
        makeSpan({
          spanId: spanId("2"),
          operation: "update_memory",
          recordsRaw: records({ id: "rec1", content: "v2" }),
          endTime: at(3),
        }),
        makeSpan({ spanId: spanId("3"), operation: "delete_memory", recordId: "rec1", endTime: at(5) }),
      ],
      memory,
    )

    const now = await reconstruct(memory, "user1")
    expect(now.records).toHaveLength(0)

    const past = await reconstruct(memory, "user1", at(4))
    expect(past.records.map((record) => record.recordId)).toEqual(["rec1"])
    const updateHash = memory.events.find((event) => event.changeKind === "update")?.contentHash
    expect(past.records[0]?.contentHash).toBe(updateHash)
  })

  it("drops records whose store was wiped after their last mutation", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({
          spanId: spanId("1"),
          operation: "create_memory",
          recordsRaw: records({ id: "rec1", content: "v1" }),
          endTime: at(0),
        }),
        makeSpan({ spanId: spanId("2"), operation: "delete_memory", recordId: "", endTime: at(5) }),
      ],
      memory,
    )
    expect((await reconstruct(memory, "user1")).records).toHaveLength(0)

    await materialize(
      [
        makeSpan({
          spanId: spanId("3"),
          operation: "create_memory",
          recordsRaw: records({ id: "rec2", content: "v2" }),
          endTime: at(10),
        }),
      ],
      memory,
    )
    expect((await reconstruct(memory, "user1")).records.map((record) => record.recordId)).toEqual(["rec2"])
  })

  it("classifies an upsert of a wiped record as add, not update", async () => {
    const memory = createFakeMemoryRepository()
    // create rec1, then wipe the store — rec1 is tombstoned in memory_current
    await materialize(
      [
        makeSpan({
          spanId: spanId("1"),
          operation: "create_memory",
          recordsRaw: records({ id: "rec1", content: "v1" }),
          endTime: at(0),
        }),
        makeSpan({ spanId: spanId("2"), operation: "delete_memory", recordId: "", endTime: at(5) }),
      ],
      memory,
    )
    // a later upsert of the wiped record must be an add, not an update
    await materialize(
      [
        makeSpan({
          spanId: spanId("3"),
          operation: "upsert_memory",
          recordsRaw: records({ id: "rec1", content: "v2" }),
          endTime: at(10),
        }),
      ],
      memory,
    )
    const upsert = memory.events.find((event) => event.spanId === spanId("3"))
    expect(upsert?.changeKind).toBe("add")
    expect((await reconstruct(memory, "user1")).records.map((record) => record.recordId)).toEqual(["rec1"])
  })
})

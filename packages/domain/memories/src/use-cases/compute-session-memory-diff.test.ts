import { ChSqlClient, ExternalUserId, OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { type MemoryOperationSpan, SpanRepository } from "@domain/spans"
import { createFakeSpanRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { MemoryRepository } from "../ports/memory-repository.ts"
import { createFakeMemoryRepository } from "../testing/index.ts"
import { computeSessionMemoryDiffUseCase } from "./compute-session-memory-diff.ts"
import { materializeTraceMemoryUseCase } from "./materialize-trace-memory.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const traceId = TraceId("t".repeat(32))
const base = new Date("2026-06-01T12:00:00.000Z").getTime()
const at = (seconds: number) => new Date(base + seconds * 1000)
const spanId = (char: string) => SpanId(char.repeat(16))
const records = (...items: { id: string; content: string }[]) => JSON.stringify(items)

type Fake = ReturnType<typeof createFakeMemoryRepository>

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
  ...o,
})

const layerFor = (memory: Fake) =>
  Layer.mergeAll(
    Layer.succeed(MemoryRepository, memory.repository),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
  )

const materialize = (
  spans: readonly MemoryOperationSpan[],
  memory: Fake,
  sessionId: SessionId = SessionId("sess1"),
) => {
  const spanRepo = createFakeSpanRepository({
    listMemoryOperationSpansByTraceId: () => Effect.succeed(spans),
  }).repository
  const layer = Layer.merge(layerFor(memory), Layer.succeed(SpanRepository, spanRepo))
  return Effect.runPromise(
    materializeTraceMemoryUseCase({ organizationId, projectId, traceId, sessionId }).pipe(Effect.provide(layer)),
  )
}

const diff = (memory: Fake, input: { sessionId: SessionId; traceId?: TraceId }) =>
  Effect.runPromise(
    computeSessionMemoryDiffUseCase({ organizationId, projectId, ...input }).pipe(Effect.provide(layerFor(memory))),
  )

describe("computeSessionMemoryDiff", () => {
  it("collapses a same-session create→update into one added change (no pre-session before)", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({
          spanId: spanId("1"),
          operation: "create_memory",
          recordsRaw: records({ id: "rec1", content: "v1" }),
          endTime: at(1),
        }),
        makeSpan({
          spanId: spanId("2"),
          operation: "update_memory",
          recordsRaw: records({ id: "rec1", content: "v1 v2" }),
          endTime: at(2),
        }),
      ],
      memory,
    )

    const result = await diff(memory, { sessionId: SessionId("sess1") })
    expect(result.records).toHaveLength(1)
    const rec1 = result.records[0]
    expect(rec1?.recordId).toBe("rec1")
    expect(rec1?.kind).toBe("added")
    expect(rec1?.beforeBody).toBeNull()
    expect(rec1?.afterBody).toBe("v1 v2")
    expect(rec1?.degraded).toBe(false)
    expect(rec1?.tokensAdded).toBeGreaterThan(0)
    expect(rec1?.tokensRemoved).toBe(0)
    expect(rec1?.lastChangeSpanId).toBe(spanId("2")) // the session's last touch (the update)
  })

  it("diffs against the pre-session version when another session wrote the record earlier", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({
          spanId: spanId("1"),
          operation: "create_memory",
          recordsRaw: records({ id: "rec1", content: "hello" }),
          endTime: at(0),
        }),
      ],
      memory,
      SessionId("sessOld"),
    )
    await materialize(
      [
        makeSpan({
          spanId: spanId("2"),
          operation: "update_memory",
          recordsRaw: records({ id: "rec1", content: "hello world" }),
          endTime: at(5),
        }),
      ],
      memory,
      SessionId("sessNew"),
    )

    const result = await diff(memory, { sessionId: SessionId("sessNew") })
    expect(result.records).toHaveLength(1)
    const rec1 = result.records[0]
    expect(rec1?.kind).toBe("updated")
    expect(rec1?.beforeBody).toBe("hello")
    expect(rec1?.afterBody).toBe("hello world")
    expect(rec1?.degraded).toBe(false)
    expect(rec1?.tokensAdded).toBeGreaterThan(0)
    expect(rec1?.lastChangeSpanId).toBe(spanId("2"))
  })

  it("omits a record added and removed within the same session", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({
          spanId: spanId("1"),
          operation: "create_memory",
          recordsRaw: records({ id: "rec2", content: "temp" }),
          endTime: at(0),
        }),
        makeSpan({ spanId: spanId("2"), operation: "delete_memory", recordId: "rec2", endTime: at(1) }),
      ],
      memory,
    )

    const result = await diff(memory, { sessionId: SessionId("sess1") })
    expect(result.records).toHaveLength(0)
  })

  it("diffs each touched record across stores", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({ spanId: spanId("1"), recordsRaw: records({ id: "rec1", content: "a" }) }),
        makeSpan({ spanId: spanId("2"), storeId: "store2", recordsRaw: records({ id: "rec2", content: "b" }) }),
      ],
      memory,
    )

    const result = await diff(memory, { sessionId: SessionId("sess1") })
    expect(result.records.map((r) => r.storeId).sort()).toEqual(["store1", "store2"])
    expect(result.records.every((r) => r.kind === "added" && r.afterBody != null && r.beforeBody === null)).toBe(true)
  })

  it("marks records a later whole-store wipe removed", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({ spanId: spanId("1"), recordsRaw: records({ id: "rec1", content: "a" }), endTime: at(0) }),
        makeSpan({ spanId: spanId("2"), recordsRaw: records({ id: "rec2", content: "b" }), endTime: at(0) }),
      ],
      memory,
      SessionId("sessOld"),
    )
    await materialize(
      [makeSpan({ spanId: spanId("9"), operation: "delete_memory", recordId: "", endTime: at(5) })],
      memory,
      SessionId("sessNew"),
    )

    const result = await diff(memory, { sessionId: SessionId("sessNew") })
    expect(result.records).toHaveLength(2)
    expect(result.records.every((r) => r.kind === "removed" && r.afterBody === null && r.beforeBody != null)).toBe(true)
    expect(result.records.every((r) => r.tokensRemoved > 0 && r.tokensAdded === 0)).toBe(true)
    expect(result.records.every((r) => r.lastChangeSpanId === null)).toBe(true) // wipe the session didn't otherwise touch
  })

  it("flags a change as degraded when the body is unavailable", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({
          spanId: spanId("1"),
          operation: "create_memory",
          recordsRaw: records({ id: "rec1", content: "hello" }),
          endTime: at(0),
        }),
      ],
      memory,
      SessionId("sessOld"),
    )
    await materialize(
      [
        makeSpan({
          spanId: spanId("2"),
          operation: "update_memory",
          recordsRaw: records({ id: "rec1", content: "hello world" }),
          endTime: at(5),
        }),
      ],
      memory,
      SessionId("sessNew"),
    )
    memory.blobs.clear() // simulate opted-out / pruned bodies

    const result = await diff(memory, { sessionId: SessionId("sessNew") })
    expect(result.records).toHaveLength(1)
    const rec1 = result.records[0]
    expect(rec1?.kind).toBe("updated")
    expect(rec1?.degraded).toBe(true)
    expect(rec1?.beforeBody).toBeNull()
    expect(rec1?.afterBody).toBeNull()
  })

  it("does not deep-link a record wiped after it was changed in the same session", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({
          spanId: spanId("1"),
          operation: "create_memory",
          recordsRaw: records({ id: "rec1", content: "hi" }),
          endTime: at(0),
        }),
      ],
      memory,
      SessionId("sessOld"),
    )
    await materialize(
      [
        makeSpan({
          spanId: spanId("2"),
          operation: "update_memory",
          recordsRaw: records({ id: "rec1", content: "hi there" }),
          endTime: at(5),
        }),
        makeSpan({ spanId: spanId("3"), operation: "delete_memory", recordId: "", endTime: at(6) }),
      ],
      memory,
      SessionId("sessNew"),
    )

    const result = await diff(memory, { sessionId: SessionId("sessNew") })
    expect(result.records).toHaveLength(1)
    expect(result.records[0]?.kind).toBe("removed")
    expect(result.records[0]?.lastChangeSpanId).toBeNull() // not the pre-wipe update span
  })

  it("restricts the diff to one trace when a trace id is given", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({
          spanId: spanId("1"),
          traceId: TraceId("1".repeat(32)),
          recordsRaw: records({ id: "rec1", content: "a" }),
        }),
        makeSpan({
          spanId: spanId("2"),
          traceId: TraceId("2".repeat(32)),
          recordsRaw: records({ id: "rec2", content: "b" }),
        }),
      ],
      memory,
    )

    const oneTrace = await diff(memory, { sessionId: SessionId("sess1"), traceId: TraceId("1".repeat(32)) })
    expect(oneTrace.records).toHaveLength(1)
    expect(oneTrace.records[0]?.recordId).toBe("rec1")

    const whole = await diff(memory, { sessionId: SessionId("sess1") })
    expect(whole.records).toHaveLength(2)
  })
})

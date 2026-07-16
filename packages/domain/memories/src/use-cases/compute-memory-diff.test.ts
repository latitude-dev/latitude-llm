import { ChSqlClient, ExternalUserId, OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { type MemoryOperationSpan, SpanRepository } from "@domain/spans"
import { createFakeSpanRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { MemoryEvent } from "../entities/memory-event.ts"
import { MemoryRepository } from "../ports/memory-repository.ts"
import { createFakeMemoryRepository } from "../testing/index.ts"
import { computeMemoryDiffUseCase } from "./compute-memory-diff.ts"
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
  scopeAttr: "",
  latitudeScopeAttr: "",
  ...o,
})

const makeEvent = (o: Partial<MemoryEvent> = {}): MemoryEvent => ({
  organizationId,
  projectId,
  scope: "user1",
  storeId: "store1",
  recordId: "rec1",
  operation: "update_memory",
  changeKind: "update",
  contentHash: "hash-a",
  tokenCount: 1,
  recordCount: 1,
  queryText: "",
  spanId: spanId("s"),
  traceId,
  sessionId: SessionId("sess1"),
  userId: ExternalUserId("user1"),
  startTime: at(0),
  endTime: at(0),
  source: "otlp",
  ...o,
})

const layerFor = (memory: Fake) =>
  Layer.mergeAll(
    Layer.succeed(MemoryRepository, memory.repository),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
  )

const materialize = (spans: readonly MemoryOperationSpan[], memory: Fake) => {
  const spanRepo = createFakeSpanRepository({
    listMemoryOperationSpansByTraceId: () => Effect.succeed(spans),
  }).repository
  const layer = Layer.merge(layerFor(memory), Layer.succeed(SpanRepository, spanRepo))
  return Effect.runPromise(
    materializeTraceMemoryUseCase({ organizationId, projectId, traceId, sessionId: SessionId("sess1") }).pipe(
      Effect.provide(layer),
    ),
  )
}

const diff = (memory: Fake, input: { scope: string; from?: Date; to?: Date }) =>
  Effect.runPromise(
    computeMemoryDiffUseCase({ organizationId, projectId, ...input }).pipe(Effect.provide(layerFor(memory))),
  )

describe("computeMemoryDiff", () => {
  it("classifies added/updated/removed, prunes unchanged records, and counts token deltas", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({ spanId: spanId("1"), recordsRaw: records({ id: "rec1", content: "hello\nworld" }), endTime: at(0) }),
        makeSpan({ spanId: spanId("2"), recordsRaw: records({ id: "rec2", content: "foo" }), endTime: at(0) }),
        makeSpan({ spanId: spanId("4"), recordsRaw: records({ id: "rec4", content: "same" }), endTime: at(0) }),
      ],
      memory,
    )
    await materialize(
      [
        makeSpan({
          spanId: spanId("5"),
          operation: "update_memory",
          recordsRaw: records({ id: "rec1", content: "hello\nplanet" }),
          endTime: at(3),
        }),
        makeSpan({ spanId: spanId("6"), recordsRaw: records({ id: "rec3", content: "new" }), endTime: at(3) }),
        makeSpan({ spanId: spanId("7"), operation: "delete_memory", recordId: "rec2", endTime: at(3) }),
      ],
      memory,
    )

    const result = await diff(memory, { scope: "user1", from: at(2), to: at(4) })
    const byId = Object.fromEntries(result.changes.map((change) => [change.recordId, change]))

    expect(Object.keys(byId).sort()).toEqual(["rec1", "rec2", "rec3"]) // rec4 pruned (hash unchanged)
    expect(result.recordsChanged).toEqual({ added: 1, updated: 1, removed: 1 })

    expect(byId.rec1?.kind).toBe("updated")
    expect(byId.rec1?.degraded).toBe(false)
    expect(byId.rec1?.tokensAdded).toBeGreaterThan(0)
    expect(byId.rec1?.tokensRemoved).toBeGreaterThan(0)

    expect(byId.rec3?.kind).toBe("added")
    expect(byId.rec3?.tokensAdded).toBeGreaterThan(0)
    expect(byId.rec3?.tokensRemoved).toBe(0)

    expect(byId.rec2?.kind).toBe("removed")
    expect(byId.rec2?.tokensAdded).toBe(0)
    expect(byId.rec2?.tokensRemoved).toBeGreaterThan(0)
  })

  it("treats every record as added when `from` is omitted", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({ spanId: spanId("1"), recordsRaw: records({ id: "rec1", content: "a" }), endTime: at(0) }),
        makeSpan({ spanId: spanId("2"), recordsRaw: records({ id: "rec2", content: "b" }), endTime: at(0) }),
      ],
      memory,
    )

    const result = await diff(memory, { scope: "user1", to: at(1) })
    expect(result.recordsChanged).toEqual({ added: 2, updated: 0, removed: 0 })
    expect(result.tokensRemoved).toBe(0)
    expect(result.tokensAdded).toBeGreaterThan(0)
  })

  it("degrades to record-level token counts when a body is unavailable", async () => {
    const memory = createFakeMemoryRepository()
    // Ledger events with content hashes but no matching blobs (opt-out / pruned).
    memory.events.push(
      makeEvent({ recordId: "rec9", changeKind: "add", contentHash: "h1", tokenCount: 5, endTime: at(0) }),
      makeEvent({ recordId: "rec9", changeKind: "update", contentHash: "h2", tokenCount: 8, endTime: at(3) }),
    )

    const result = await diff(memory, { scope: "user1", from: at(2), to: at(4) })
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]?.kind).toBe("updated")
    expect(result.changes[0]?.degraded).toBe(true)
    expect(result.changes[0]?.tokensAdded).toBe(8)
    expect(result.changes[0]?.tokensRemoved).toBe(5)
  })
})

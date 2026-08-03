import { ChSqlClient, ExternalUserId, OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { type MemoryOperationSpan, SpanRepository } from "@domain/spans"
import { createFakeSpanRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { MemoryRepository } from "../ports/memory-repository.ts"
import { createFakeMemoryRepository } from "../testing/index.ts"
import { computeSessionMemorySummaryUseCase } from "./compute-session-memory-summary.ts"
import { materializeTraceMemoryUseCase } from "./materialize-trace-memory.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const traceId = TraceId("t".repeat(32))
const base = new Date("2026-06-01T12:00:00.000Z").getTime()
const at = (seconds: number) => new Date(base + seconds * 1000)
const spanId = (char: string) => SpanId(char.repeat(16))
const traceN = (n: number) => TraceId(String(n).padStart(32, "0"))
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

const summarize = (memory: Fake, input: { sessionId: SessionId; traceId?: TraceId }) =>
  Effect.runPromise(
    computeSessionMemorySummaryUseCase({ organizationId, projectId, ...input }).pipe(Effect.provide(layerFor(memory))),
  )

describe("computeSessionMemorySummary", () => {
  it("sums read tokens and collapses same-session create→update to a net add", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({
          spanId: spanId("r"),
          operation: "search_memory",
          queryText: "q",
          recordsRaw: records({ id: "rec1", content: "alpha beta gamma" }),
          endTime: at(0),
        }),
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

    const summary = await summarize(memory, { sessionId: SessionId("sess1") })
    expect(summary.records).toHaveLength(1)
    const rec1 = summary.records[0]
    expect(rec1?.recordId).toBe("rec1")
    expect(rec1?.readTokens).toBeGreaterThan(0)
    expect(rec1?.tokensAdded).toBeGreaterThan(0) // create→update nets to one add
    expect(rec1?.tokensRemoved).toBe(0)
    expect(summary.total.readTokens).toBeGreaterThan(0)
    expect(summary.total.tokensAdded).toBeGreaterThan(0)
    expect(summary.total.tokensRemoved).toBe(0)
  })

  it("uses the pre-session version as `before` when another session wrote the record earlier", async () => {
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

    const summary = await summarize(memory, { sessionId: SessionId("sessNew") })
    expect(summary.records).toHaveLength(1)
    expect(summary.records[0]?.readTokens).toBe(0)
    expect(summary.records[0]?.tokensAdded).toBeGreaterThan(0)
    expect(summary.records[0]?.tokensRemoved).toBeGreaterThan(0)
    expect(summary.total.tokensAdded).toBeGreaterThan(0)
    expect(summary.total.tokensRemoved).toBeGreaterThan(0)
  })

  it("nets out a record added and removed within the same session", async () => {
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

    const summary = await summarize(memory, { sessionId: SessionId("sess1") })
    expect(summary.records).toHaveLength(0)
    expect(summary.total).toEqual({ readTokens: 0, tokensAdded: 0, tokensRemoved: 0, writeRecords: 0 })
  })

  it("counts a zero-token write in writeRecords even when it drops from the records list", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [makeSpan({ spanId: spanId("1"), operation: "create_memory", recordsRaw: records({ id: "rec1", content: "" }) })],
      memory,
    )

    const summary = await summarize(memory, { sessionId: SessionId("sess1") })
    expect(summary.records).toHaveLength(0) // no read/added/removed tokens, so filtered from the breakdown
    expect(summary.total.tokensAdded).toBe(0)
    expect(summary.total.writeRecords).toBe(1) // but the write still counts, so the section stays visible
  })

  it("lists each touched record across multiple stores in the session", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({ spanId: spanId("1"), recordsRaw: records({ id: "rec1", content: "a" }) }),
        makeSpan({
          spanId: spanId("2"),
          storeId: "store2",
          recordsRaw: records({ id: "rec2", content: "b" }),
        }),
      ],
      memory,
    )

    const summary = await summarize(memory, { sessionId: SessionId("sess1") })
    expect(summary.records.map((r) => r.storeId).sort()).toEqual(["store1", "store2"])
    expect(summary.records.every((r) => r.tokensAdded > 0)).toBe(true)
    expect(summary.total.tokensAdded).toBeGreaterThan(0)
  })

  it("counts a later session's whole-store wipe as removing the live records", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({
          spanId: spanId("1"),
          recordsRaw: records({ id: "rec1", content: "a" }),
          endTime: at(0),
        }),
        makeSpan({
          spanId: spanId("2"),
          recordsRaw: records({ id: "rec2", content: "b" }),
          endTime: at(0),
        }),
      ],
      memory,
      SessionId("sessOld"),
    )
    await materialize(
      [
        makeSpan({
          spanId: spanId("9"),
          operation: "delete_memory",
          recordId: "",
          endTime: at(5),
        }),
      ],
      memory,
      SessionId("sessNew"),
    )

    const summary = await summarize(memory, { sessionId: SessionId("sessNew") })
    expect(summary.records).toHaveLength(2)
    expect(summary.records.every((r) => r.tokensRemoved > 0 && r.tokensAdded === 0)).toBe(true)
    expect(summary.total.tokensRemoved).toBeGreaterThan(0)
    expect(summary.total.tokensAdded).toBe(0)
  })

  it("does not re-count records an earlier wipe already removed", async () => {
    const memory = createFakeMemoryRepository()
    // rec1 lived then was wiped before the session; only rec2 is live going in.
    await materialize(
      [
        makeSpan({ spanId: spanId("1"), recordsRaw: records({ id: "rec1", content: "a" }), endTime: at(0) }),
        makeSpan({ spanId: spanId("2"), operation: "delete_memory", recordId: "", endTime: at(1) }),
        makeSpan({ spanId: spanId("3"), recordsRaw: records({ id: "rec2", content: "b" }), endTime: at(2) }),
      ],
      memory,
      SessionId("sessOld"),
    )
    await materialize(
      [makeSpan({ spanId: spanId("9"), operation: "delete_memory", recordId: "", endTime: at(5) })],
      memory,
      SessionId("sessNew"),
    )

    const summary = await summarize(memory, { sessionId: SessionId("sessNew") })
    expect(summary.records.map((record) => record.recordId)).toEqual(["rec2"]) // rec1 already gone at t1
    expect(summary.total.tokensRemoved).toBeGreaterThan(0)
  })

  it("nets out a record created and whole-store wiped at the same end_time", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({
          spanId: spanId("1"),
          recordsRaw: records({ id: "rec1", content: "a" }),
          endTime: at(0),
        }),
        makeSpan({ spanId: spanId("2"), operation: "delete_memory", recordId: "", endTime: at(0) }),
      ],
      memory,
    )

    const summary = await summarize(memory, { sessionId: SessionId("sess1") })
    expect(summary.records).toHaveLength(0)
    expect(summary.total).toEqual({ readTokens: 0, tokensAdded: 0, tokensRemoved: 0, writeRecords: 0 })
  })

  it("counts a create after a same-timestamp whole-store wipe", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({ spanId: spanId("1"), operation: "delete_memory", recordId: "", endTime: at(0) }),
        makeSpan({
          spanId: spanId("2"),
          recordsRaw: records({ id: "rec1", content: "a" }),
          endTime: at(0),
        }),
      ],
      memory,
    )

    const summary = await summarize(memory, { sessionId: SessionId("sess1") })
    expect(summary.records).toHaveLength(1)
    expect(summary.records[0]?.tokensAdded).toBeGreaterThan(0)
  })

  it("restricts the summary to one trace when a trace id is given", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({ spanId: spanId("1"), traceId: traceN(1), recordsRaw: records({ id: "rec1", content: "a" }) }),
        makeSpan({ spanId: spanId("2"), traceId: traceN(2), recordsRaw: records({ id: "rec2", content: "b" }) }),
      ],
      memory,
    )

    const oneTrace = await summarize(memory, { sessionId: SessionId("sess1"), traceId: traceN(1) })
    expect(oneTrace.records).toHaveLength(1)
    expect(oneTrace.total.tokensAdded).toBeGreaterThan(0)

    const whole = await summarize(memory, { sessionId: SessionId("sess1") })
    expect(whole.records).toHaveLength(2)
  })
})

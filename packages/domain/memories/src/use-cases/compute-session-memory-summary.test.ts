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
  scopeAttr: "",
  latitudeScopeAttr: "",
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
    materializeTraceMemoryUseCase({ organizationId, projectId, traceId }).pipe(Effect.provide(layer)),
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
    expect(summary.scopes).toHaveLength(1)
    expect(summary.total.readTokens).toBeGreaterThan(0)
    expect(summary.total.recordsAdded).toBe(1) // create→update nets to one add
    expect(summary.total.recordsUpdated).toBe(0)
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
          sessionId: SessionId("sessOld"),
          endTime: at(0),
        }),
      ],
      memory,
    )
    await materialize(
      [
        makeSpan({
          spanId: spanId("2"),
          operation: "update_memory",
          recordsRaw: records({ id: "rec1", content: "hello world" }),
          sessionId: SessionId("sessNew"),
          endTime: at(5),
        }),
      ],
      memory,
    )

    const summary = await summarize(memory, { sessionId: SessionId("sessNew") })
    expect(summary.total.recordsAdded).toBe(0)
    expect(summary.total.recordsUpdated).toBe(1)
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
    expect(summary.scopes).toHaveLength(0)
    expect(summary.total.recordsAdded).toBe(0)
    expect(summary.total.recordsRemoved).toBe(0)
  })

  it("splits the write diff across the scopes a session touched", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({ spanId: spanId("1"), recordsRaw: records({ id: "rec1", content: "a" }), scopeAttr: "team-x" }),
        makeSpan({
          spanId: spanId("2"),
          storeId: "store2",
          recordsRaw: records({ id: "rec2", content: "b" }),
          scopeAttr: "team-y",
        }),
      ],
      memory,
    )

    const summary = await summarize(memory, { sessionId: SessionId("sess1") })
    expect(summary.scopes.map((s) => s.scope).sort()).toEqual(["team-x", "team-y"])
    expect(summary.scopes.every((s) => s.recordsAdded === 1)).toBe(true)
    expect(summary.total.recordsAdded).toBe(2)
  })

  it("counts a later session's whole-store wipe as removing the live records", async () => {
    const memory = createFakeMemoryRepository()
    await materialize(
      [
        makeSpan({
          spanId: spanId("1"),
          recordsRaw: records({ id: "rec1", content: "a" }),
          sessionId: SessionId("sessOld"),
          endTime: at(0),
        }),
        makeSpan({
          spanId: spanId("2"),
          recordsRaw: records({ id: "rec2", content: "b" }),
          sessionId: SessionId("sessOld"),
          endTime: at(0),
        }),
      ],
      memory,
    )
    await materialize(
      [
        makeSpan({
          spanId: spanId("9"),
          operation: "delete_memory",
          recordId: "",
          sessionId: SessionId("sessNew"),
          endTime: at(5),
        }),
      ],
      memory,
    )

    const summary = await summarize(memory, { sessionId: SessionId("sessNew") })
    expect(summary.total.recordsRemoved).toBe(2)
    expect(summary.total.recordsAdded).toBe(0)
    expect(summary.total.tokensRemoved).toBeGreaterThan(0)
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
    expect(oneTrace.total.recordsAdded).toBe(1)

    const whole = await summarize(memory, { sessionId: SessionId("sess1") })
    expect(whole.total.recordsAdded).toBe(2)
  })
})

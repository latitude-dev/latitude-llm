import { ChSqlClient, ExternalUserId, OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { MemoryBlob } from "../entities/memory-blob.ts"
import type { MemoryChangeKind, MemoryEvent } from "../entities/memory-event.ts"
import { MemoryRepository } from "../ports/memory-repository.ts"
import { createFakeMemoryRepository } from "../testing/index.ts"
import { computeRecordHistoryUseCase } from "./compute-record-history.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const traceId = TraceId("t".repeat(32))
const sessionId = SessionId("sess1")
const userId = ExternalUserId("user1")
const storeId = "store1"
const recordId = "rec1"
const base = new Date("2026-06-01T12:00:00.000Z").getTime()
const at = (seconds: number) => new Date(base + seconds * 1000)
const spanId = (char: string) => SpanId(char.repeat(16))

type Fake = ReturnType<typeof createFakeMemoryRepository>

const hashOf = (body: string) => `h:${body}`

const pushVersion = (
  memory: Fake,
  opts: {
    readonly span: SpanId
    readonly changeKind: MemoryChangeKind
    readonly endTime: Date
    readonly body?: string
    readonly contentHash?: string
  },
) => {
  const contentHash = opts.contentHash ?? (opts.body !== undefined ? hashOf(opts.body) : "")
  memory.events.push({
    organizationId,
    projectId,
    storeId,
    recordId,
    operation: opts.changeKind === "remove" ? "delete_memory" : "create_memory",
    changeKind: opts.changeKind,
    contentHash,
    tokenCount: opts.body ? opts.body.length : 0,
    recordCount: 1,
    queryText: "",
    spanId: opts.span,
    traceId,
    sessionId,
    userId,
    startTime: opts.endTime,
    endTime: opts.endTime,
    source: "otlp",
  } satisfies MemoryEvent)
  if (opts.body !== undefined && contentHash !== "") {
    memory.blobs.set(`${organizationId} ${contentHash}`, {
      organizationId,
      contentHash,
      content: opts.body,
      contentFileKey: "",
      byteSize: opts.body.length,
      tokenCount: opts.body.length,
    } satisfies MemoryBlob)
  }
}

const run = (memory: Fake) =>
  Effect.runPromise(
    computeRecordHistoryUseCase({ organizationId, projectId, storeId, recordId }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MemoryRepository, memory.repository),
          Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
        ),
      ),
    ),
  )

describe("computeRecordHistory", () => {
  it("returns the current body and newest-first versions", async () => {
    const memory = createFakeMemoryRepository()
    pushVersion(memory, { span: spanId("a"), changeKind: "add", body: "line1\nline2", endTime: at(0) })
    pushVersion(memory, { span: spanId("b"), changeKind: "update", body: "line1\nline2\nline3", endTime: at(1) })

    const history = await run(memory)
    expect(history.body).toBe("line1\nline2\nline3")
    expect(history.versions.map((v) => v.spanId)).toEqual([spanId("b"), spanId("a")])
    expect(history.tokenCount).toBe(history.versions[0]?.tokenCount)
  })

  it("counts appended lines as added only", async () => {
    const memory = createFakeMemoryRepository()
    pushVersion(memory, { span: spanId("a"), changeKind: "add", body: "line1\n", endTime: at(0) })
    pushVersion(memory, { span: spanId("b"), changeKind: "update", body: "line1\nline2\n", endTime: at(1) })

    const [update, firstAdd] = (await run(memory)).versions
    expect(update?.tokensAdded).toBeGreaterThan(0)
    expect(update?.tokensRemoved).toBe(0)
    // The first version is a whole-body add: everything added, nothing removed.
    expect(firstAdd?.tokensRemoved).toBe(0)
    expect(firstAdd?.tokensAdded).toBeGreaterThan(0)
  })

  it("counts both sides for an in-place modification", async () => {
    const memory = createFakeMemoryRepository()
    pushVersion(memory, { span: spanId("a"), changeKind: "add", body: "keep\nold", endTime: at(0) })
    pushVersion(memory, { span: spanId("b"), changeKind: "update", body: "keep\nnew", endTime: at(1) })

    const modify = (await run(memory)).versions[0]
    expect(modify?.tokensAdded).toBeGreaterThan(0)
    expect(modify?.tokensRemoved).toBeGreaterThan(0)
  })

  it("reports a removal as removed-only with no current body", async () => {
    const memory = createFakeMemoryRepository()
    pushVersion(memory, { span: spanId("a"), changeKind: "add", body: "hello\nworld", endTime: at(0) })
    pushVersion(memory, { span: spanId("b"), changeKind: "remove", endTime: at(1) })

    const history = await run(memory)
    expect(history.body).toBeNull()
    expect(history.tokenCount).toBe(0)
    const remove = history.versions[0]
    expect(remove?.tokensAdded).toBe(0)
    expect(remove?.tokensRemoved).toBeGreaterThan(0)
  })

  it("degrades to record token counts when a blob is absent", async () => {
    const memory = createFakeMemoryRepository()
    pushVersion(memory, { span: spanId("a"), changeKind: "add", body: "known", endTime: at(0) })
    pushVersion(memory, { span: spanId("b"), changeKind: "update", contentHash: hashOf("uncaptured"), endTime: at(1) })

    const update = (await run(memory)).versions[0]
    expect(update?.degraded).toBe(true)
  })
})

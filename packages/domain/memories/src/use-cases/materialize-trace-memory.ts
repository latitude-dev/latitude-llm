import { createHash } from "node:crypto"
import type { OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { type MemoryOperationSpan, SpanRepository } from "@domain/spans"
import { Effect } from "effect"
import type { MemoryBlob } from "../entities/memory-blob.ts"
import type { MemoryCurrentEntry } from "../entities/memory-current.ts"
import { compareMemoryEventOrder, type MemoryChangeKind, type MemoryEvent } from "../entities/memory-event.ts"
import { memoryRecordBody, parseMemoryRecords } from "../entities/memory-record.ts"
import { countTokens } from "../entities/tokenizer.ts"
import { MemoryRepository } from "../ports/memory-repository.ts"

export interface MaterializeTraceMemoryInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  /** The trace's canonical session id, stamped on every event so the ledger's
   * session_id agrees with the trace/session entity — a memory span may carry
   * no session attribute even when its sibling chat spans do. */
  readonly sessionId: SessionId
}

export interface MaterializeTraceMemoryResult {
  readonly eventCount: number
  readonly blobCount: number
  readonly recordCount: number
}

const textEncoder = new TextEncoder()
const sha256Hex = (body: string) => createHash("sha256").update(body).digest("hex")
const byteLength = (body: string) => textEncoder.encode(body).length

const isWholeStoreWipe = (span: MemoryOperationSpan): boolean =>
  span.operation === "delete_memory_store" || (span.operation === "delete_memory" && span.recordId === "")

// Stores whose pre-trace live-record set we need: upsert (add-vs-update) and
// whole-store wipes (tombstoning the store's records).
const needsPresentSeed = (span: MemoryOperationSpan): boolean =>
  span.operation === "upsert_memory" || isWholeStoreWipe(span)

/**
 * Materialize one settled trace's memory-operation spans into the ledger:
 * per mutated record write a content-addressed blob (dedup by sha256), a
 * ledger event, and a `memory_current` projection row; record reads and
 * store-lifecycle events for completeness. Spans apply in `endTime`, then
 * `startTime`, then `spanId` order so "last-to-finish wins" ([D2]) holds.
 *
 * A whole-store wipe ([D9]) writes a `remove` row into `memory_current` for
 * each of the store's live records, so the current-state view reflects the wipe
 * without depending on the `store_delete` ledger event surviving retention, and
 * a later `upsert` of a wiped record is classified `add` rather than `update`.
 */
export const materializeTraceMemoryUseCase = Effect.fn("memories.materializeTraceMemory")(function* (
  input: MaterializeTraceMemoryInput,
) {
  const { organizationId, projectId, traceId, sessionId } = input
  yield* Effect.annotateCurrentSpan("memory.traceId", traceId)

  const spanRepository = yield* SpanRepository
  const memoryRepository = yield* MemoryRepository

  const spans = [...(yield* spanRepository.listMemoryOperationSpansByTraceId({ organizationId, projectId, traceId }))]
  spans.sort(compareMemoryEventOrder)
  if (spans.length === 0) {
    return { eventCount: 0, blobCount: 0, recordCount: 0 } satisfies MaterializeTraceMemoryResult
  }

  // Live records per store. Seeded from the pre-trace snapshot for stores with an
  // upsert or a whole-store wipe (the snapshot already excludes records
  // tombstoned by earlier wipes), then kept in step as spans apply.
  const present = new Map<string, Set<string>>()
  for (const storeId of new Set(spans.filter(needsPresentSeed).map((span) => span.storeId))) {
    const snapshot = yield* memoryRepository.readCurrentSnapshot({ organizationId, projectId, storeId })
    const records = new Set<string>()
    for (const version of snapshot) records.add(version.recordId)
    present.set(storeId, records)
  }
  const liveRecords = (storeId: string): Set<string> => {
    let records = present.get(storeId)
    if (!records) {
      records = new Set()
      present.set(storeId, records)
    }
    return records
  }

  const events: MemoryEvent[] = []
  const blobs = new Map<string, MemoryBlob>()
  const current = new Map<string, MemoryCurrentEntry>()
  const currentKey = (storeId: string, recordId: string) => JSON.stringify([storeId, recordId])

  const pushSpanEvent = (
    span: MemoryOperationSpan,
    changeKind: MemoryChangeKind,
    extra: { readonly recordId?: string; readonly tokenCount?: number; readonly queryText?: string } = {},
  ) => {
    events.push({
      organizationId,
      projectId,
      storeId: span.storeId,
      recordId: extra.recordId ?? "",
      operation: span.operation,
      changeKind,
      contentHash: "",
      tokenCount: extra.tokenCount ?? 0,
      recordCount: span.recordCount,
      queryText: extra.queryText ?? "",
      spanId: span.spanId,
      traceId: span.traceId,
      sessionId,
      userId: span.userId,
      startTime: span.startTime,
      endTime: span.endTime,
      source: "otlp",
    })
  }

  const applyMutation = (
    span: MemoryOperationSpan,
    recordId: string,
    body: string | null,
    changeKind: MemoryChangeKind,
  ) => {
    let contentHash = ""
    let tokens = 0
    if (body !== null) {
      contentHash = sha256Hex(body)
      tokens = countTokens(body)
      if (!blobs.has(contentHash)) {
        blobs.set(contentHash, {
          organizationId,
          contentHash,
          content: body,
          contentFileKey: "",
          byteSize: byteLength(body),
          tokenCount: tokens,
        })
      }
    }
    events.push({
      organizationId,
      projectId,
      storeId: span.storeId,
      recordId,
      operation: span.operation,
      changeKind,
      contentHash,
      tokenCount: tokens,
      recordCount: span.recordCount,
      queryText: "",
      spanId: span.spanId,
      traceId: span.traceId,
      sessionId,
      userId: span.userId,
      startTime: span.startTime,
      endTime: span.endTime,
      source: "otlp",
    })
    current.set(currentKey(span.storeId, recordId), {
      organizationId,
      projectId,
      storeId: span.storeId,
      recordId,
      contentHash,
      changeKind,
      tokenCount: tokens,
      spanId: span.spanId,
      traceId: span.traceId,
      sessionId,
      endTime: span.endTime,
    })
    const records = liveRecords(span.storeId)
    if (changeKind === "remove") records.delete(recordId)
    else records.add(recordId)
  }

  // Tombstone every live record in the wiped store: a `remove` projection row
  // (no ledger event — the store_delete event already records the operation).
  const tombstoneStore = (span: MemoryOperationSpan) => {
    const records = liveRecords(span.storeId)
    for (const recordId of [...records]) {
      current.set(currentKey(span.storeId, recordId), {
        organizationId,
        projectId,
        storeId: span.storeId,
        recordId,
        contentHash: "",
        changeKind: "remove",
        tokenCount: 0,
        spanId: span.spanId,
        traceId: span.traceId,
        sessionId,
        endTime: span.endTime,
      })
      records.delete(recordId)
    }
  }

  const mutatingKind = (span: MemoryOperationSpan, recordId: string): MemoryChangeKind => {
    if (span.operation === "create_memory") return "add"
    if (span.operation === "update_memory") return "update"
    // upsert_memory: exists in the current manifest → update, else add.
    return liveRecords(span.storeId).has(recordId) ? "update" : "add"
  }

  for (const span of spans) {
    switch (span.operation) {
      case "search_memory": {
        // One read event per returned record, keyed on the record's own id so
        // the read attributes to that record; id-less hits fall back to the
        // span's (usually empty) record id and bucket together.
        const records = parseMemoryRecords(span.recordsRaw)
        if (records && records.length > 0) {
          for (const record of records) {
            pushSpanEvent(span, "read", {
              recordId: record.id ?? span.recordId,
              tokenCount: countTokens(memoryRecordBody(record)),
              queryText: span.queryText,
            })
          }
        } else {
          pushSpanEvent(span, "read", { recordId: span.recordId, tokenCount: 0, queryText: span.queryText })
        }
        break
      }

      case "create_memory_store": {
        pushSpanEvent(span, "store_create")
        break
      }

      case "delete_memory_store": {
        pushSpanEvent(span, "store_delete")
        tombstoneStore(span)
        break
      }

      case "delete_memory": {
        if (span.recordId === "") {
          // Absent record id ⇒ whole-store wipe (D9).
          pushSpanEvent(span, "store_delete")
          tombstoneStore(span)
        } else {
          applyMutation(span, span.recordId, null, "remove")
        }
        break
      }

      default: {
        // create_memory / update_memory / upsert_memory
        const records = parseMemoryRecords(span.recordsRaw)
        if (records && records.length > 0) {
          for (const record of records) {
            const recordId = record.id ?? span.recordId
            applyMutation(span, recordId, memoryRecordBody(record), mutatingKind(span, recordId))
          }
        } else {
          // content opt-out: record the version keyed on the scalar record id, no body
          applyMutation(span, span.recordId, null, mutatingKind(span, span.recordId))
        }
      }
    }
  }

  yield* memoryRepository.upsertBlobs([...blobs.values()])
  yield* memoryRepository.insertEvents(events)
  yield* memoryRepository.upsertCurrent([...current.values()])

  yield* Effect.annotateCurrentSpan("memory.eventCount", events.length)
  return {
    eventCount: events.length,
    blobCount: blobs.size,
    recordCount: current.size,
  } satisfies MaterializeTraceMemoryResult
})

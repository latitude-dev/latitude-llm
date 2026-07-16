import { createHash } from "node:crypto"
import type { OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { type MemoryOperationSpan, SpanRepository } from "@domain/spans"
import { Effect } from "effect"
import type { MemoryBlob } from "../entities/memory-blob.ts"
import type { MemoryCurrentEntry } from "../entities/memory-current.ts"
import type { MemoryChangeKind, MemoryEvent } from "../entities/memory-event.ts"
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

const resolveScope = (span: MemoryOperationSpan): string =>
  span.scopeAttr || span.latitudeScopeAttr || (span.userId as string) || ""

const isWholeStoreWipe = (span: MemoryOperationSpan): boolean =>
  span.operation === "delete_memory_store" || (span.operation === "delete_memory" && span.recordId === "")

// Scopes whose pre-trace live-record set we need: upsert (add-vs-update) and
// whole-store wipes (tombstoning the store's records).
const needsPresentSeed = (span: MemoryOperationSpan): boolean =>
  span.operation === "upsert_memory" || isWholeStoreWipe(span)

/**
 * Materialize one settled trace's memory-operation spans into the ledger:
 * per mutated record write a content-addressed blob (dedup by sha256), a
 * ledger event, and a `memory_current` projection row; record reads and
 * store-lifecycle events for completeness. Spans arrive ordered by `end_time`
 * so "last-to-finish wins" ([D2]) holds within the trace.
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

  const spans = yield* spanRepository.listMemoryOperationSpansByTraceId({ organizationId, projectId, traceId })
  if (spans.length === 0) {
    return { eventCount: 0, blobCount: 0, recordCount: 0 } satisfies MaterializeTraceMemoryResult
  }

  // Live records per scope, per store. Seeded from the pre-trace snapshot for
  // scopes with an upsert or a whole-store wipe (the snapshot already excludes
  // records tombstoned by earlier wipes), then kept in step as spans apply.
  const present = new Map<string, Map<string, Set<string>>>()
  for (const scope of new Set(spans.filter(needsPresentSeed).map(resolveScope))) {
    const snapshot = yield* memoryRepository.readCurrentSnapshot({ organizationId, projectId, scope })
    const byStore = new Map<string, Set<string>>()
    for (const version of snapshot) {
      const records = byStore.get(version.storeId) ?? new Set<string>()
      records.add(version.recordId)
      byStore.set(version.storeId, records)
    }
    present.set(scope, byStore)
  }
  const liveRecords = (scope: string, storeId: string): Set<string> => {
    let byStore = present.get(scope)
    if (!byStore) {
      byStore = new Map()
      present.set(scope, byStore)
    }
    let records = byStore.get(storeId)
    if (!records) {
      records = new Set()
      byStore.set(storeId, records)
    }
    return records
  }

  const events: MemoryEvent[] = []
  const blobs = new Map<string, MemoryBlob>()
  const current = new Map<string, MemoryCurrentEntry>()
  const currentKey = (scope: string, storeId: string, recordId: string) => JSON.stringify([scope, storeId, recordId])

  const pushSpanEvent = (
    span: MemoryOperationSpan,
    scope: string,
    changeKind: MemoryChangeKind,
    extra: { readonly recordId?: string; readonly tokenCount?: number; readonly queryText?: string } = {},
  ) => {
    events.push({
      organizationId,
      projectId,
      scope,
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
    scope: string,
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
      scope,
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
    current.set(currentKey(scope, span.storeId, recordId), {
      organizationId,
      projectId,
      scope,
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
    const records = liveRecords(scope, span.storeId)
    if (changeKind === "remove") records.delete(recordId)
    else records.add(recordId)
  }

  // Tombstone every live record in the wiped store: a `remove` projection row
  // (no ledger event — the store_delete event already records the operation).
  const tombstoneStore = (span: MemoryOperationSpan, scope: string) => {
    const records = liveRecords(scope, span.storeId)
    for (const recordId of [...records]) {
      current.set(currentKey(scope, span.storeId, recordId), {
        organizationId,
        projectId,
        scope,
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

  const mutatingKind = (span: MemoryOperationSpan, scope: string, recordId: string): MemoryChangeKind => {
    if (span.operation === "create_memory") return "add"
    if (span.operation === "update_memory") return "update"
    // upsert_memory: exists in the current manifest → update, else add.
    return liveRecords(scope, span.storeId).has(recordId) ? "update" : "add"
  }

  for (const span of spans) {
    const scope = resolveScope(span)

    switch (span.operation) {
      case "search_memory": {
        const records = parseMemoryRecords(span.recordsRaw)
        const tokens = records ? records.reduce((sum, record) => sum + countTokens(memoryRecordBody(record)), 0) : 0
        pushSpanEvent(span, scope, "read", { recordId: span.recordId, tokenCount: tokens, queryText: span.queryText })
        break
      }

      case "create_memory_store": {
        pushSpanEvent(span, scope, "store_create")
        break
      }

      case "delete_memory_store": {
        pushSpanEvent(span, scope, "store_delete")
        tombstoneStore(span, scope)
        break
      }

      case "delete_memory": {
        if (span.recordId === "") {
          // Absent record id ⇒ whole-store wipe (D9).
          pushSpanEvent(span, scope, "store_delete")
          tombstoneStore(span, scope)
        } else {
          applyMutation(span, scope, span.recordId, null, "remove")
        }
        break
      }

      default: {
        // create_memory / update_memory / upsert_memory
        const records = parseMemoryRecords(span.recordsRaw)
        if (records && records.length > 0) {
          for (const record of records) {
            const recordId = record.id ?? span.recordId
            applyMutation(span, scope, recordId, memoryRecordBody(record), mutatingKind(span, scope, recordId))
          }
        } else {
          // content opt-out: record the version keyed on the scalar record id, no body
          applyMutation(span, scope, span.recordId, null, mutatingKind(span, scope, span.recordId))
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

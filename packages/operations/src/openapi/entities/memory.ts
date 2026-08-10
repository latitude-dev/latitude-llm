import {
  MEMORY_CHANGE_KINDS,
  type MemoryDiff,
  type MemoryEvent,
  type MemoryRecordUser,
  type MemorySnapshot,
  type MemoryStoreListItem,
  type MemoryStoreUser,
  type MemoryUserStore,
  type RecordChangeDiff,
  type RecordHistory,
  type SessionMemoryDiff,
  type SessionMemorySummary,
} from "@domain/memories"
import { z } from "@hono/zod-openapi"
import { Paginated } from "../pagination.ts"

const nullableString = () => z.string().nullable()

const memoryChangeKindSchema = z
  .enum(MEMORY_CHANGE_KINDS)
  .describe(
    "Kind of memory operation: `add`/`update`/`remove` (mutations), `read` (retrieval), or `store_create`/`store_delete` (store lifecycle).",
  )

// Offset wrapped as an opaque base64url cursor to keep the `{ items, nextCursor, hasMore }` shape.
export const encodeMemoryStoreOffsetCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url")

export const decodeMemoryStoreOffsetCursor = (raw: string): number | null => {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8")
    const parsed = JSON.parse(json) as unknown
    const offset = (parsed as { offset?: unknown }).offset
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof offset !== "number" ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    ) {
      return null
    }
    return offset
  } catch {
    return null
  }
}

const MemoryStoreSchema = z
  .object({
    storeId: z
      .string()
      .describe("Store identifier (`gen_ai.memory.store.id`). The empty string is the unattributed bucket."),
    recordCount: z.number().int().nonnegative().describe("Number of live (non-deleted) records in the store."),
    tokenCount: z.number().int().nonnegative().describe("Total tokens across the store's live record bodies."),
    lastUpdatedAt: z.string().describe("ISO-8601 timestamp of the store's most recent mutating write."),
    lastReadAt: nullableString().describe(
      "ISO-8601 timestamp of the store's most recent read. `null` when never read.",
    ),
    sessionCount: z.number().int().nonnegative().describe("Number of distinct sessions that wrote to the store."),
    userCount: z.number().int().nonnegative().describe("Number of distinct end-users who accessed the store."),
  })
  .openapi("MemoryStore")

export const PaginatedMemoryStoresSchema = Paginated(MemoryStoreSchema, "PaginatedMemoryStores")

export const toMemoryStoreResponse = (store: MemoryStoreListItem) => ({
  storeId: store.storeId,
  recordCount: store.recordCount,
  tokenCount: store.tokenCount,
  lastUpdatedAt: store.lastUpdatedAt.toISOString(),
  lastReadAt: store.lastReadAt ? store.lastReadAt.toISOString() : null,
  sessionCount: store.sessionCount,
  userCount: store.userCount,
})

const MemoryStoreRecordSchema = z
  .object({
    recordId: z
      .string()
      .describe("Record identifier (`gen_ai.memory.record.id`); opaque. The empty string is the unnamed record."),
    tokenCount: z.number().int().nonnegative().describe("Tokens in the record's current body."),
    lastUpdatedAt: z.string().describe("ISO-8601 timestamp of the version that produced the current body."),
  })
  .openapi("MemoryStoreRecord")

export const MemoryStoreSnapshotSchema = z
  .object({
    records: z
      .array(MemoryStoreRecordSchema)
      .describe("The store's current records (ids plus light metadata), one per live record."),
  })
  .openapi("MemoryStoreSnapshot")

export const toMemoryStoreSnapshotResponse = (snapshot: MemorySnapshot) => ({
  records: snapshot.records.map((record) => ({
    recordId: record.recordId,
    tokenCount: record.tokenCount,
    lastUpdatedAt: record.endTime.toISOString(),
  })),
})

const MemoryStoreChangeSchema = z
  .object({
    recordId: z.string().describe("Record that changed between the two points."),
    kind: z
      .enum(["added", "updated", "removed"])
      .describe(
        "How the record changed: `added` (only at `to`), `removed` (only at `from`), or `updated` (present at both with a different body).",
      ),
    tokensAdded: z.number().int().nonnegative().describe("Tokens inserted by this change."),
    tokensRemoved: z.number().int().nonnegative().describe("Tokens deleted by this change."),
    degraded: z
      .boolean()
      .describe("`true` when a body was unavailable and token counts fall back to record-level estimates."),
  })
  .openapi("MemoryStoreChange")

export const MemoryStoreDiffSchema = z
  .object({
    storeId: z.string().describe("Store the diff was computed for."),
    changes: z
      .array(MemoryStoreChangeSchema)
      .describe("Per-record changes between the two points; unchanged records are pruned."),
    tokensAdded: z.number().int().nonnegative().describe("Total tokens added across all changed records."),
    tokensRemoved: z.number().int().nonnegative().describe("Total tokens removed across all changed records."),
    recordsChanged: z
      .object({
        added: z.number().int().nonnegative().describe("Number of records added."),
        updated: z.number().int().nonnegative().describe("Number of records updated."),
        removed: z.number().int().nonnegative().describe("Number of records removed."),
      })
      .describe("Count of changed records per bucket."),
  })
  .openapi("MemoryStoreDiff")

export const toMemoryStoreDiffResponse = (diff: MemoryDiff) => ({
  storeId: diff.storeId,
  changes: diff.changes.map((change) => ({
    recordId: change.recordId,
    kind: change.kind,
    tokensAdded: change.tokensAdded,
    tokensRemoved: change.tokensRemoved,
    degraded: change.degraded,
  })),
  tokensAdded: diff.tokensAdded,
  tokensRemoved: diff.tokensRemoved,
  recordsChanged: {
    added: diff.recordsChanged.added,
    updated: diff.recordsChanged.updated,
    removed: diff.recordsChanged.removed,
  },
})

const MemoryStoreUserSchema = z
  .object({
    userId: z.string().describe("End-user identifier that accessed the store."),
    lastAccessedAt: z.string().describe("ISO-8601 timestamp of the user's most recent access (read or write)."),
  })
  .openapi("MemoryStoreUser")

export const MemoryStoreUsersSchema = z
  .object({
    items: z.array(MemoryStoreUserSchema).describe("End-users who accessed the store, most recent access first."),
  })
  .openapi("MemoryStoreUsers")

export const toMemoryStoreUsersResponse = (users: readonly MemoryStoreUser[]) => ({
  items: users.map((user) => ({
    userId: user.userId as string,
    lastAccessedAt: user.lastAccessedAt.toISOString(),
  })),
})

const MemoryRecordVersionSchema = z
  .object({
    changeKind: memoryChangeKindSchema,
    tokenCount: z.number().int().nonnegative().describe("Tokens in the body produced by this version."),
    tokensAdded: z.number().int().nonnegative().describe("Tokens added by this version versus its predecessor."),
    tokensRemoved: z.number().int().nonnegative().describe("Tokens removed by this version versus its predecessor."),
    spanId: z.string().describe("Span that authored this version."),
    traceId: z.string().describe("Trace the authoring span belongs to."),
    sessionId: z.string().describe("Session the authoring trace belongs to."),
    userId: z.string().describe("End-user attributed to the authoring span. Empty when none."),
    endTime: z.string().describe("ISO-8601 timestamp of the authoring span's end (the version ordering key)."),
  })
  .openapi("MemoryRecordVersion")

export const MemoryRecordDetailSchema = z
  .object({
    body: nullableString().describe(
      "The record's current body. `null` when the record is deleted or its body was not captured.",
    ),
    tokenCount: z.number().int().nonnegative().describe("Tokens in the current body."),
    versions: z.array(MemoryRecordVersionSchema).describe("The record's mutating version chain, newest first."),
  })
  .openapi("MemoryRecordDetail")

export const toMemoryRecordDetailResponse = (history: RecordHistory) => ({
  body: history.body,
  tokenCount: history.tokenCount,
  versions: history.versions.map((version) => ({
    changeKind: version.changeKind,
    tokenCount: version.tokenCount,
    tokensAdded: version.tokensAdded,
    tokensRemoved: version.tokensRemoved,
    spanId: version.spanId as string,
    traceId: version.traceId as string,
    sessionId: version.sessionId as string,
    userId: version.userId as string,
    endTime: version.endTime.toISOString(),
  })),
})

export const MemoryRecordChangeDiffSchema = z
  .object({
    changeKind: memoryChangeKindSchema,
    beforeBody: nullableString().describe(
      "The record's body before the change. `null` for the record's first version, a re-create after removal, or when the prior body was not captured.",
    ),
    afterBody: nullableString().describe(
      "The record's body after the change. `null` for a `remove`, or when the body was not captured.",
    ),
    degraded: z.boolean().describe("`true` when a side's body was unavailable, so the diff is incomplete."),
  })
  .openapi("MemoryRecordChangeDiff")

export const toMemoryRecordChangeDiffResponse = (diff: RecordChangeDiff) => ({
  changeKind: diff.changeKind,
  beforeBody: diff.beforeBody,
  afterBody: diff.afterBody,
  degraded: diff.degraded,
})

const MemoryRecordReadSchema = z
  .object({
    spanId: z.string().describe("Span that performed the read (`search_memory`)."),
    traceId: z.string().describe("Trace the read span belongs to."),
    sessionId: z.string().describe("Session the read trace belongs to."),
    userId: z.string().describe("End-user attributed to the read. Empty when none."),
    queryText: z.string().describe("The search query text, when captured (opt-in). Empty otherwise."),
    tokenCount: z.number().int().nonnegative().describe("Tokens in the record returned by the read."),
    endTime: z.string().describe("ISO-8601 timestamp of the read span's end."),
  })
  .openapi("MemoryRecordRead")

export const MemoryRecordReadsSchema = z
  .object({
    items: z.array(MemoryRecordReadSchema).describe("Retrieval events for the record, newest first, capped."),
  })
  .openapi("MemoryRecordReads")

export const toMemoryRecordReadsResponse = (events: readonly MemoryEvent[]) => ({
  items: events.map((event) => ({
    spanId: event.spanId as string,
    traceId: event.traceId as string,
    sessionId: event.sessionId as string,
    userId: event.userId as string,
    queryText: event.queryText,
    tokenCount: event.tokenCount,
    endTime: event.endTime.toISOString(),
  })),
})

const MemoryRecordUserSchema = z
  .object({
    userId: z.string().describe("End-user identifier that accessed the record."),
    readCount: z.number().int().nonnegative().describe("Number of reads the user made on the record."),
    writeCount: z.number().int().nonnegative().describe("Number of writes the user made to the record."),
    lastAccessedAt: z.string().describe("ISO-8601 timestamp of the user's most recent access."),
  })
  .openapi("MemoryRecordUser")

export const MemoryRecordUsersSchema = z
  .object({
    items: z.array(MemoryRecordUserSchema).describe("End-users who accessed the record, most recent access first."),
  })
  .openapi("MemoryRecordUsers")

export const toMemoryRecordUsersResponse = (users: readonly MemoryRecordUser[]) => ({
  items: users.map((user) => ({
    userId: user.userId as string,
    readCount: user.readCount,
    writeCount: user.writeCount,
    lastAccessedAt: user.lastAccessedAt.toISOString(),
  })),
})

const MemoryRecordSummarySchema = z
  .object({
    storeId: z.string().describe("Store the record belongs to."),
    recordId: z.string().describe("Record the metrics are for."),
    readTokens: z
      .number()
      .int()
      .nonnegative()
      .describe("Tokens read from this record across the session's retrievals."),
    tokensAdded: z.number().int().nonnegative().describe("Tokens the session added to this record (endpoint diff)."),
    tokensRemoved: z
      .number()
      .int()
      .nonnegative()
      .describe("Tokens the session removed from this record (endpoint diff)."),
  })
  .openapi("MemoryRecordSummary")

export const SessionMemorySummarySchema = z
  .object({
    records: z
      .array(MemoryRecordSummarySchema)
      .describe("Per-record read/write token footprint for the session (or a single trace)."),
    total: z
      .object({
        readTokens: z.number().int().nonnegative().describe("Total tokens read across the session."),
        tokensAdded: z.number().int().nonnegative().describe("Total tokens added across the session."),
        tokensRemoved: z.number().int().nonnegative().describe("Total tokens removed across the session."),
        writeRecords: z
          .number()
          .int()
          .nonnegative()
          .describe("Number of records the session wrote, including zero-delta writes."),
      })
      .describe("Session-wide totals."),
  })
  .openapi("SessionMemorySummary")

export const toSessionMemorySummaryResponse = (summary: SessionMemorySummary) => ({
  records: summary.records.map((record) => ({
    storeId: record.storeId,
    recordId: record.recordId,
    readTokens: record.readTokens,
    tokensAdded: record.tokensAdded,
    tokensRemoved: record.tokensRemoved,
  })),
  total: {
    readTokens: summary.total.readTokens,
    tokensAdded: summary.total.tokensAdded,
    tokensRemoved: summary.total.tokensRemoved,
    writeRecords: summary.total.writeRecords,
  },
})

const SessionMemoryChangeSchema = z
  .object({
    storeId: z.string().describe("Store the changed record belongs to."),
    recordId: z.string().describe("Record that changed."),
    kind: z.enum(["added", "updated", "removed"]).describe("How the session changed the record."),
    beforeBody: nullableString().describe(
      "The record's body before the session's writes. `null` when added or when the prior body was not captured.",
    ),
    afterBody: nullableString().describe(
      "The record's body after the session's writes. `null` when removed or when the body was not captured.",
    ),
    tokensAdded: z.number().int().nonnegative().describe("Tokens added by the session's writes."),
    tokensRemoved: z.number().int().nonnegative().describe("Tokens removed by the session's writes."),
    degraded: z.boolean().describe("`true` when a side's body was unavailable, so the diff is incomplete."),
    lastChangeSpanId: nullableString().describe(
      "Span of the session's last write to this record. `null` when unknown.",
    ),
  })
  .openapi("SessionMemoryChange")

export const SessionMemoryChangesSchema = z
  .object({
    records: z.array(SessionMemoryChangeSchema).describe("Per-record before/after diffs for what the session changed."),
  })
  .openapi("SessionMemoryChanges")

export const toSessionMemoryChangesResponse = (diff: SessionMemoryDiff) => ({
  records: diff.records.map((record) => ({
    storeId: record.storeId,
    recordId: record.recordId,
    kind: record.kind,
    beforeBody: record.beforeBody,
    afterBody: record.afterBody,
    tokensAdded: record.tokensAdded,
    tokensRemoved: record.tokensRemoved,
    degraded: record.degraded,
    lastChangeSpanId: record.lastChangeSpanId,
  })),
})

const MemoryUserStoreSchema = z
  .object({
    storeId: z.string().describe("Store the user accessed. The empty string is the unattributed bucket."),
    lastAccessedAt: z.string().describe("ISO-8601 timestamp of the user's most recent access to the store."),
  })
  .openapi("MemoryUserStore")

export const UserMemoryStoresSchema = z
  .object({
    items: z.array(MemoryUserStoreSchema).describe("Memory stores the user accessed, most recent access first."),
  })
  .openapi("UserMemoryStores")

export const toUserMemoryStoresResponse = (stores: readonly MemoryUserStore[]) => ({
  items: stores.map((store) => ({
    storeId: store.storeId,
    lastAccessedAt: store.lastAccessedAt.toISOString(),
  })),
})

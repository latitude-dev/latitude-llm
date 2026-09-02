import type { ClickHouseClient } from "@clickhouse/client"
import type {
  MemoryBlob,
  MemoryChangeKind,
  MemoryCurrentEntry,
  MemoryEvent,
  MemoryEventSource,
  MemoryRecordUser,
  MemoryRecordVersion,
  MemoryRepositoryShape,
  MemoryStoreListItem,
  MemoryStoreSortField,
  MemoryStoreUser,
  MemoryStoreWipe,
  MemoryUserStore,
} from "@domain/memories"
import { MemoryRepository } from "@domain/memories"
import {
  ChSqlClient,
  type ChSqlClientShape,
  ExternalUserId,
  type OrganizationId,
  type ProjectId,
  SessionId,
  SpanId,
  TraceId,
  toRepositoryError,
} from "@domain/shared"
import { formatCHDate, normalizeCHString, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"

const VERSION_COLUMNS = `
  store_id,
  record_id,
  content_hash,
  change_kind,
  token_count,
  span_id,
  trace_id,
  session_id,
  end_time
`

type MemoryRecordVersionRow = {
  readonly store_id: string
  readonly record_id: string
  readonly content_hash: string
  readonly change_kind: string
  readonly token_count: string | number
  readonly span_id: string
  readonly trace_id: string
  readonly session_id: string
  // Only selected by the record-version read (from `memory_events`); the
  // manifest/current reads project it as absent, hence optional.
  readonly user_id?: string
  readonly record_end_time: string
}

type StoreWipeRow = {
  readonly store_id: string
  readonly end_time: string
}

const EVENT_COLUMNS = `
  store_id,
  record_id,
  operation,
  change_kind,
  content_hash,
  token_count,
  record_count,
  query_text,
  span_id,
  trace_id,
  session_id,
  user_id,
  start_time,
  end_time,
  source
`

type MemoryEventRow = {
  readonly store_id: string
  readonly record_id: string
  readonly operation: string
  readonly change_kind: string
  readonly content_hash: string
  readonly token_count: string | number
  readonly record_count: string | number
  readonly query_text: string
  readonly span_id: string
  readonly trace_id: string
  readonly session_id: string
  readonly user_id: string
  readonly start_time: string
  readonly end_time: string
  readonly source: string
}

type MemoryBlobRow = {
  readonly content_hash: string
  readonly content: string
  readonly content_file_key: string
  readonly byte_size: string | number
  readonly token_count: string | number
}

// Fixed map — never interpolate user input into ORDER BY. Values are the output
// aliases of the store-list query below.
const STORE_SORT_EXPRS: Record<MemoryStoreSortField, string> = {
  lastUpdated: "last_updated_at",
  lastRead: "last_read_at",
  records: "record_count",
  tokens: "token_count",
  sessions: "session_count",
  users: "user_count",
}

const STORE_ACCESS_LIST_CAP = 1000
const RECORD_READ_EVENTS_CAP = 200

// The store set + current-derived metrics: latest version per record (removes
// dropped), grouped by store. `store_id = ''` is kept (the unattributed bucket).
const CURRENT_STORE_AGG = `
  SELECT
    store_id,
    count()          AS record_count,
    sum(token_count) AS token_count,
    max(end_time)    AS last_updated_at
  FROM (
    SELECT store_id, record_id, token_count, change_kind, end_time
    FROM memory_current
    WHERE organization_id = {organizationId:String}
      AND project_id = {projectId:String}
    ORDER BY store_id, record_id, end_time DESC
    LIMIT 1 BY store_id, record_id
  )
  WHERE change_kind != 'remove'
  GROUP BY store_id
`

// Event-derived metrics across ALL change_kinds (reads count). No dedup subquery:
// uniqExactIf / maxIf are idempotent to retried-projection duplicates, whose
// (span_id, store_id, record_id) rows carry identical session/user/end_time.
const EVENT_STORE_AGG = `
  SELECT
    store_id,
    uniqExactIf(session_id, session_id != '') AS session_count,
    uniqExactIf(user_id, user_id != '')       AS user_count,
    maxIf(end_time, change_kind = 'read')      AS last_read_at
  FROM memory_events
  WHERE organization_id = {organizationId:String}
    AND project_id = {projectId:String}
  GROUP BY store_id
`

type MemoryStoreRow = {
  readonly store_id: string
  readonly record_count: string | number
  readonly token_count: string | number
  readonly last_updated_at: string
  readonly session_count: string | number
  readonly user_count: string | number
  readonly last_read_at: string
}

type StoreUserRow = {
  readonly user_id: string
  readonly last_accessed_at: string
}

type UserStoreRow = {
  readonly store_id: string
  readonly last_accessed_at: string
}

type RecordUserRow = {
  readonly user_id: string
  readonly read_count: string | number
  readonly write_count: string | number
  readonly last_accessed_at: string
}

const toStoreListItem = (row: MemoryStoreRow): MemoryStoreListItem => {
  // The LEFT JOIN default (or `maxIf` with no matching read) yields the
  // DateTime64 epoch, which we surface as "never read".
  const lastRead = parseCHDate(row.last_read_at)
  return {
    storeId: row.store_id,
    recordCount: Number(row.record_count),
    tokenCount: Number(row.token_count),
    lastUpdatedAt: parseCHDate(row.last_updated_at),
    sessionCount: Number(row.session_count),
    userCount: Number(row.user_count),
    lastReadAt: lastRead.getTime() > 0 ? lastRead : null,
  }
}

const toEvent =
  (organizationId: OrganizationId, projectId: ProjectId) =>
  (row: MemoryEventRow): MemoryEvent => ({
    organizationId,
    projectId,
    storeId: row.store_id,
    recordId: row.record_id,
    operation: row.operation,
    changeKind: row.change_kind as MemoryChangeKind,
    contentHash: row.content_hash,
    tokenCount: Number(row.token_count),
    recordCount: Number(row.record_count),
    queryText: row.query_text,
    spanId: SpanId(normalizeCHString(row.span_id)),
    traceId: TraceId(normalizeCHString(row.trace_id)),
    sessionId: SessionId(row.session_id),
    userId: ExternalUserId(normalizeCHString(row.user_id)),
    startTime: parseCHDate(row.start_time),
    endTime: parseCHDate(row.end_time),
    source: row.source as MemoryEventSource,
  })

const toBlob =
  (organizationId: OrganizationId) =>
  (row: MemoryBlobRow): MemoryBlob => ({
    organizationId,
    contentHash: row.content_hash,
    content: row.content,
    contentFileKey: row.content_file_key,
    byteSize: Number(row.byte_size),
    tokenCount: Number(row.token_count),
  })

const toEventInsertRow = (event: MemoryEvent, ingestedAt: Date) => ({
  organization_id: event.organizationId as string,
  project_id: event.projectId as string,
  store_id: event.storeId,
  record_id: event.recordId,
  operation: event.operation,
  change_kind: event.changeKind,
  content_hash: event.contentHash,
  token_count: event.tokenCount,
  record_count: event.recordCount,
  query_text: event.queryText,
  span_id: event.spanId as string,
  trace_id: event.traceId as string,
  session_id: event.sessionId as string,
  user_id: event.userId as string,
  start_time: formatCHDate(event.startTime),
  end_time: formatCHDate(event.endTime),
  ingested_at: formatCHDate(ingestedAt),
  source: event.source,
})

const toBlobInsertRow = (blob: MemoryBlob) => ({
  organization_id: blob.organizationId as string,
  content_hash: blob.contentHash,
  content: blob.content,
  content_file_key: blob.contentFileKey,
  byte_size: blob.byteSize,
  token_count: blob.tokenCount,
})

const toCurrentInsertRow = (entry: MemoryCurrentEntry) => ({
  organization_id: entry.organizationId as string,
  project_id: entry.projectId as string,
  store_id: entry.storeId,
  record_id: entry.recordId,
  content_hash: entry.contentHash,
  change_kind: entry.changeKind,
  token_count: entry.tokenCount,
  span_id: entry.spanId as string,
  trace_id: entry.traceId as string,
  session_id: entry.sessionId as string,
  end_time: formatCHDate(entry.endTime),
})

const toVersion = (row: MemoryRecordVersionRow): MemoryRecordVersion => ({
  storeId: row.store_id,
  recordId: row.record_id,
  contentHash: row.content_hash,
  changeKind: row.change_kind as MemoryChangeKind,
  tokenCount: Number(row.token_count),
  spanId: SpanId(normalizeCHString(row.span_id)),
  traceId: TraceId(normalizeCHString(row.trace_id)),
  sessionId: SessionId(row.session_id),
  userId: ExternalUserId(normalizeCHString(row.user_id ?? "")),
  endTime: parseCHDate(row.record_end_time),
})

export const MemoryRepositoryLive = Layer.effect(
  MemoryRepository,
  Effect.gen(function* () {
    const insertEvents: MemoryRepositoryShape["insertEvents"] = (events) =>
      Effect.gen(function* () {
        if (events.length === 0) return
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        yield* chSqlClient
          .query(async (client) => {
            const ingestedAtBase = Date.now()
            await client.insert({
              table: "memory_events",
              values: events.map((event, index) => toEventInsertRow(event, new Date(ingestedAtBase + index))),
              format: "JSONEachRow",
            })
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.insertEvents")))
      })

    const upsertBlobs: MemoryRepositoryShape["upsertBlobs"] = (blobs) =>
      Effect.gen(function* () {
        if (blobs.length === 0) return
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        yield* chSqlClient
          .query(async (client) => {
            await client.insert({
              table: "memory_blobs",
              values: blobs.map(toBlobInsertRow),
              format: "JSONEachRow",
            })
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.upsertBlobs")))
      })

    const upsertCurrent: MemoryRepositoryShape["upsertCurrent"] = (entries) =>
      Effect.gen(function* () {
        if (entries.length === 0) return
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        yield* chSqlClient
          .query(async (client) => {
            await client.insert({
              table: "memory_current",
              values: entries.map(toCurrentInsertRow),
              format: "JSONEachRow",
            })
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.upsertCurrent")))
      })

    const readCurrentSnapshot: MemoryRepositoryShape["readCurrentSnapshot"] = ({
      organizationId,
      projectId,
      storeId,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT store_id, record_id, content_hash, change_kind, token_count,
                             span_id, trace_id, session_id, end_time AS record_end_time
                      FROM (
                        SELECT ${VERSION_COLUMNS}
                        FROM memory_current
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND store_id = {storeId:String}
                        ORDER BY store_id, record_id, end_time DESC
                        LIMIT 1 BY store_id, record_id
                      )
                      WHERE change_kind != 'remove'`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                storeId,
              },
              format: "JSONEachRow",
            })
            const rows = await result.json<MemoryRecordVersionRow>()
            return rows.map(toVersion)
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.readCurrentSnapshot")))
      })

    const readManifestAt: MemoryRepositoryShape["readManifestAt"] = ({ organizationId, projectId, storeId, at }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              // Filter in a subquery so `end_time` in WHERE resolves to the column, not
              // the `max(end_time) AS end_time` aggregate alias (ILLEGAL_AGGREGATION otherwise).
              query: `SELECT store_id,
                             record_id,
                             argMax(content_hash, end_time) AS content_hash,
                             argMax(change_kind, end_time)  AS change_kind,
                             argMax(token_count, end_time)  AS token_count,
                             argMax(span_id, end_time)      AS span_id,
                             argMax(trace_id, end_time)     AS trace_id,
                             argMax(session_id, end_time)   AS session_id,
                             max(end_time)                  AS record_end_time
                      FROM (
                        SELECT ${VERSION_COLUMNS}
                        FROM memory_events
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND store_id = {storeId:String}
                          AND change_kind IN ('add', 'update', 'remove')
                          AND end_time <= {at:DateTime64(6, 'UTC')}
                      )
                      GROUP BY store_id, record_id
                      HAVING change_kind != 'remove'`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                storeId,
                at: formatCHDate(at),
              },
              format: "JSONEachRow",
            })
            const rows = await result.json<MemoryRecordVersionRow>()
            return rows.map(toVersion)
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.readManifestAt")))
      })

    const readLatestStoreWipes: MemoryRepositoryShape["readLatestStoreWipes"] = ({
      organizationId,
      projectId,
      storeId,
      at,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              // Filter in a subquery so `end_time` in WHERE resolves to the column, not
              // the `max(end_time) AS end_time` aggregate alias (ILLEGAL_AGGREGATION otherwise).
              query: `SELECT store_id, max(end_time) AS end_time
                      FROM (
                        SELECT store_id, end_time
                        FROM memory_events
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND store_id = {storeId:String}
                          AND change_kind = 'store_delete'
                          AND end_time <= {at:DateTime64(6, 'UTC')}
                      )
                      GROUP BY store_id`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                storeId,
                at: formatCHDate(at),
              },
              format: "JSONEachRow",
            })
            const rows = await result.json<StoreWipeRow>()
            return rows.map((row): MemoryStoreWipe => ({ storeId: row.store_id, endTime: parseCHDate(row.end_time) }))
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.readLatestStoreWipes")))
      })

    const readBlobs: MemoryRepositoryShape["readBlobs"] = ({ organizationId, hashes }) =>
      Effect.gen(function* () {
        const wanted = hashes.filter((hash) => hash !== "")
        if (wanted.length === 0) return []
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT content_hash, content, content_file_key, byte_size, token_count
                      FROM memory_blobs FINAL
                      WHERE organization_id = {organizationId:String}
                        AND content_hash IN {hashes:Array(String)}`,
              query_params: { organizationId: organizationId as string, hashes: wanted },
              format: "JSONEachRow",
            })
            const rows = await result.json<MemoryBlobRow>()
            return rows.map(toBlob(organizationId))
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.readBlobs")))
      })

    const readSessionMemoryEvents: MemoryRepositoryShape["readSessionMemoryEvents"] = ({
      organizationId,
      projectId,
      sessionId,
      traceId,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              // Dedup retried projection rows (append-only ledger) to one per
              // (trace_id, span_id, store_id, record_id), keeping the newest ingest.
              query: `SELECT ${EVENT_COLUMNS}
                      FROM (
                        SELECT ${EVENT_COLUMNS}, ingested_at
                        FROM memory_events
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND session_id = {sessionId:String}
                          ${traceId !== undefined ? "AND trace_id = {traceId:FixedString(32)}" : ""}
                        ORDER BY trace_id, span_id, store_id, record_id, ingested_at DESC
                        LIMIT 1 BY trace_id, span_id, store_id, record_id
                      )
                      ORDER BY end_time ASC, start_time ASC, ingested_at ASC, span_id ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                sessionId: sessionId as string,
                ...(traceId !== undefined ? { traceId: traceId as string } : {}),
              },
              format: "JSONEachRow",
            })
            const rows = await result.json<MemoryEventRow>()
            return rows.map(toEvent(organizationId, projectId))
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.readSessionMemoryEvents")))
      })

    const readRecordVersions: MemoryRepositoryShape["readRecordVersions"] = ({
      organizationId,
      projectId,
      records,
      at,
    }) =>
      Effect.gen(function* () {
        if (records.length === 0) return []
        // Two-array cross-product (no Array(Tuple) support); exact pairs are
        // filtered in the caller. `wanted` narrows the returned set back down.
        const storeIds = [...new Set(records.map((record) => record.storeId))]
        const recordIds = [...new Set(records.map((record) => record.recordId))]
        const wanted = new Set(records.map((record) => `${record.storeId}\u0000${record.recordId}`))
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT store_id, record_id, content_hash, change_kind, token_count,
                             span_id, trace_id, session_id, user_id, end_time AS record_end_time
                      FROM (
                        SELECT ${VERSION_COLUMNS}, user_id, ingested_at
                        FROM memory_events
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND change_kind IN ('add', 'update', 'remove')
                          AND store_id IN {storeIds:Array(String)}
                          AND record_id IN {recordIds:Array(String)}
                          ${at !== undefined ? "AND end_time <= {at:DateTime64(6, 'UTC')}" : ""}
                        ORDER BY trace_id, span_id, store_id, record_id, ingested_at DESC
                        LIMIT 1 BY trace_id, span_id, store_id, record_id
                      )
                      ORDER BY store_id, record_id, end_time ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                storeIds,
                recordIds,
                ...(at !== undefined ? { at: formatCHDate(at) } : {}),
              },
              format: "JSONEachRow",
            })
            const rows = await result.json<MemoryRecordVersionRow>()
            return rows.map(toVersion).filter((version) => wanted.has(`${version.storeId}\u0000${version.recordId}`))
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.readRecordVersions")))
      })

    const listStores: MemoryRepositoryShape["listStores"] = ({ organizationId, projectId, options }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const limit = options?.limit ?? 50
        const offset = options?.offset ?? 0
        const sortExpr = STORE_SORT_EXPRS[options?.sortBy ?? "lastUpdated"]
        const orderDir = options?.sortDirection === "asc" ? "ASC" : "DESC"
        const params = { organizationId: organizationId as string, projectId: projectId as string }

        const [rows, countRows] = yield* Effect.all(
          [
            chSqlClient.query(async (client) => {
              const result = await client.query({
                query: `SELECT
                          c.store_id        AS store_id,
                          c.record_count    AS record_count,
                          c.token_count     AS token_count,
                          c.last_updated_at AS last_updated_at,
                          e.session_count   AS session_count,
                          e.user_count      AS user_count,
                          e.last_read_at    AS last_read_at
                        FROM (${CURRENT_STORE_AGG}) AS c
                        LEFT JOIN (${EVENT_STORE_AGG}) AS e ON c.store_id = e.store_id
                        ORDER BY ${sortExpr} ${orderDir}, store_id ASC
                        LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
                query_params: { ...params, limit: limit + 1, offset },
                format: "JSONEachRow",
              })
              return result.json<MemoryStoreRow>()
            }),
            chSqlClient.query(async (client) => {
              const result = await client.query({
                query: `SELECT count() AS total FROM (${CURRENT_STORE_AGG})`,
                query_params: params,
                format: "JSONEachRow",
              })
              return result.json<{ total: string | number }>()
            }),
          ],
          { concurrency: 2 },
        ).pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.listStores")))

        const hasMore = rows.length > limit
        const pageRows = hasMore ? rows.slice(0, limit) : rows
        return {
          items: pageRows.map(toStoreListItem),
          totalCount: Number(countRows[0]?.total ?? 0),
          hasMore,
          limit,
          offset,
        }
      })

    const readRecordReadEvents: MemoryRepositoryShape["readRecordReadEvents"] = ({
      organizationId,
      projectId,
      storeId,
      recordId,
      limit,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              // Dedup retried projection rows to one per (trace_id, span_id)
              // (store/record are pinned by the WHERE), then newest read first.
              query: `SELECT ${EVENT_COLUMNS}
                      FROM (
                        SELECT ${EVENT_COLUMNS}, ingested_at
                        FROM memory_events
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND store_id = {storeId:String}
                          AND record_id = {recordId:String}
                          AND change_kind = 'read'
                        ORDER BY trace_id, span_id, store_id, record_id, ingested_at DESC
                        LIMIT 1 BY trace_id, span_id, store_id, record_id
                      )
                      ORDER BY end_time DESC
                      LIMIT {limit:UInt32}`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                storeId,
                recordId,
                limit: limit ?? RECORD_READ_EVENTS_CAP,
              },
              format: "JSONEachRow",
            })
            const rows = await result.json<MemoryEventRow>()
            return rows.map(toEvent(organizationId, projectId))
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.readRecordReadEvents")))
      })

    const listRecordUsers: MemoryRepositoryShape["listRecordUsers"] = ({
      organizationId,
      projectId,
      storeId,
      recordId,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              // Dedup retried projection rows to one per (trace_id, span_id)
              // before counting — `countIf` (unlike `maxIf`) is not idempotent to duplicates.
              query: `SELECT user_id,
                             countIf(change_kind = 'read')                       AS read_count,
                             countIf(change_kind IN ('add', 'update', 'remove')) AS write_count,
                             max(end_time)                                       AS last_accessed_at
                      FROM (
                        SELECT trace_id, span_id, user_id, change_kind, end_time
                        FROM memory_events
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND store_id = {storeId:String}
                          AND record_id = {recordId:String}
                          AND user_id != ''
                        ORDER BY trace_id, span_id, ingested_at DESC
                        LIMIT 1 BY trace_id, span_id
                      )
                      GROUP BY user_id
                      ORDER BY last_accessed_at DESC, user_id ASC
                      LIMIT {cap:UInt16}`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                storeId,
                recordId,
                cap: STORE_ACCESS_LIST_CAP,
              },
              format: "JSONEachRow",
            })
            const rows = await result.json<RecordUserRow>()
            return rows.map(
              (row): MemoryRecordUser => ({
                userId: ExternalUserId(normalizeCHString(row.user_id)),
                readCount: Number(row.read_count),
                writeCount: Number(row.write_count),
                lastAccessedAt: parseCHDate(row.last_accessed_at),
              }),
            )
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.listRecordUsers")))
      })

    const listStoreUsers: MemoryRepositoryShape["listStoreUsers"] = ({ organizationId, projectId, storeId }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT user_id, max(end_time) AS last_accessed_at
                      FROM memory_events
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND store_id = {storeId:String}
                        AND user_id != ''
                      GROUP BY user_id
                      ORDER BY last_accessed_at DESC, user_id ASC
                      LIMIT {cap:UInt16}`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                storeId,
                cap: STORE_ACCESS_LIST_CAP,
              },
              format: "JSONEachRow",
            })
            const rows = await result.json<StoreUserRow>()
            return rows.map(
              (row): MemoryStoreUser => ({
                userId: ExternalUserId(normalizeCHString(row.user_id)),
                lastAccessedAt: parseCHDate(row.last_accessed_at),
              }),
            )
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.listStoreUsers")))
      })

    const listUserStores: MemoryRepositoryShape["listUserStores"] = ({ organizationId, projectId, userId }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT store_id, max(end_time) AS last_accessed_at
                      FROM memory_events
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND user_id = {userId:String}
                      GROUP BY store_id
                      ORDER BY last_accessed_at DESC, store_id ASC
                      LIMIT {cap:UInt16}`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                userId: userId as string,
                cap: STORE_ACCESS_LIST_CAP,
              },
              format: "JSONEachRow",
            })
            const rows = await result.json<UserStoreRow>()
            return rows.map(
              (row): MemoryUserStore => ({
                storeId: row.store_id,
                lastAccessedAt: parseCHDate(row.last_accessed_at),
              }),
            )
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.listUserStores")))
      })

    return {
      insertEvents,
      upsertBlobs,
      upsertCurrent,
      readCurrentSnapshot,
      readManifestAt,
      readLatestStoreWipes,
      readBlobs,
      readSessionMemoryEvents,
      readRecordVersions,
      readRecordReadEvents,
      listRecordUsers,
      listStores,
      listStoreUsers,
      listUserStores,
    }
  }),
)

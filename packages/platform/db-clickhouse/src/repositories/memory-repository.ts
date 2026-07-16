import type { ClickHouseClient } from "@clickhouse/client"
import type {
  MemoryBlob,
  MemoryChangeKind,
  MemoryCurrentEntry,
  MemoryEvent,
  MemoryEventSource,
  MemoryRecordVersion,
  MemoryRepositoryShape,
  MemoryStoreWipe,
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
  readonly record_end_time: string
}

type StoreWipeRow = {
  readonly store_id: string
  readonly end_time: string
}

const EVENT_COLUMNS = `
  scope,
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
  readonly scope: string
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

const toEvent =
  (organizationId: OrganizationId, projectId: ProjectId) =>
  (row: MemoryEventRow): MemoryEvent => ({
    organizationId,
    projectId,
    scope: row.scope,
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

const toEventInsertRow = (event: MemoryEvent) => ({
  organization_id: event.organizationId as string,
  project_id: event.projectId as string,
  scope: event.scope,
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
  scope: entry.scope,
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
            await client.insert({
              table: "memory_events",
              values: events.map(toEventInsertRow),
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

    const readCurrentSnapshot: MemoryRepositoryShape["readCurrentSnapshot"] = ({ organizationId, projectId, scope }) =>
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
                          AND scope = {scope:String}
                        ORDER BY store_id, record_id, end_time DESC
                        LIMIT 1 BY store_id, record_id
                      )
                      WHERE change_kind != 'remove'`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                scope,
              },
              format: "JSONEachRow",
            })
            const rows = await result.json<MemoryRecordVersionRow>()
            return rows.map(toVersion)
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.readCurrentSnapshot")))
      })

    const readManifestAt: MemoryRepositoryShape["readManifestAt"] = ({ organizationId, projectId, scope, at }) =>
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
                          AND scope = {scope:String}
                          AND change_kind IN ('add', 'update', 'remove')
                          AND end_time <= {at:DateTime64(6, 'UTC')}
                      )
                      GROUP BY store_id, record_id
                      HAVING change_kind != 'remove'`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                scope,
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
      scope,
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
                          AND scope = {scope:String}
                          AND change_kind = 'store_delete'
                          AND end_time <= {at:DateTime64(6, 'UTC')}
                      )
                      GROUP BY store_id`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                scope,
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
              // (span_id, store_id, record_id), keeping the newest ingest.
              query: `SELECT ${EVENT_COLUMNS}
                      FROM (
                        SELECT ${EVENT_COLUMNS}, ingested_at
                        FROM memory_events
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND session_id = {sessionId:String}
                          ${traceId !== undefined ? "AND trace_id = {traceId:FixedString(32)}" : ""}
                        ORDER BY span_id, store_id, record_id, ingested_at DESC
                        LIMIT 1 BY span_id, store_id, record_id
                      )
                      ORDER BY end_time ASC`,
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
      scope,
      records,
      at,
    }) =>
      Effect.gen(function* () {
        if (records.length === 0) return []
        // Two-array cross-product (no Array(Tuple) support); exact pairs are
        // filtered in the caller. `wanted` narrows the returned set back down.
        const storeIds = [...new Set(records.map((record) => record.storeId))]
        const recordIds = [...new Set(records.map((record) => record.recordId))]
        const wanted = new Set(records.map((record) => `${record.storeId} ${record.recordId}`))
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT store_id, record_id, content_hash, change_kind, token_count,
                             span_id, trace_id, session_id, end_time AS record_end_time
                      FROM (
                        SELECT ${VERSION_COLUMNS}, ingested_at
                        FROM memory_events
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND scope = {scope:String}
                          AND change_kind IN ('add', 'update', 'remove')
                          AND store_id IN {storeIds:Array(String)}
                          AND record_id IN {recordIds:Array(String)}
                          ${at !== undefined ? "AND end_time <= {at:DateTime64(6, 'UTC')}" : ""}
                        ORDER BY span_id, store_id, record_id, ingested_at DESC
                        LIMIT 1 BY span_id, store_id, record_id
                      )
                      ORDER BY store_id, record_id, end_time ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                scope,
                storeIds,
                recordIds,
                ...(at !== undefined ? { at: formatCHDate(at) } : {}),
              },
              format: "JSONEachRow",
            })
            const rows = await result.json<MemoryRecordVersionRow>()
            return rows.map(toVersion).filter((version) => wanted.has(`${version.storeId} ${version.recordId}`))
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryRepository.readRecordVersions")))
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
    }
  }),
)

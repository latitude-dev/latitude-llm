import type { ClickHouseClient } from "@clickhouse/client"
import type {
  MemoryBlob,
  MemoryChangeKind,
  MemoryCurrentEntry,
  MemoryEvent,
  MemoryRecordVersion,
  MemoryRepositoryShape,
  MemoryStoreWipe,
} from "@domain/memories"
import { MemoryRepository } from "@domain/memories"
import { ChSqlClient, type ChSqlClientShape, SessionId, SpanId, TraceId, toRepositoryError } from "@domain/shared"
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

    return {
      insertEvents,
      upsertBlobs,
      upsertCurrent,
      readCurrentSnapshot,
      readManifestAt,
      readLatestStoreWipes,
    }
  }),
)

import { MAIN_SPAN_TYPES, Span } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE, SpanRow } from '../../../clickhouse/models/spans'
import { spanRowToSpan } from './toSpan'

export async function getLastTraceByLogUuid({
  workspaceId,
  logUuid,
}: {
  workspaceId: number
  logUuid: string
}): Promise<string | undefined> {
  const result = await clickhouseClient().query({
    query: `
      SELECT trace_id
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid = {logUuid: UUID}
      ORDER BY started_at DESC
      LIMIT 1
    `,
    format: 'JSONEachRow',
    query_params: { workspaceId, logUuid },
  })

  const rows = await result.json<{ trace_id: string }>()
  return rows[0]?.trace_id
}

export async function listTraceIdsByLogUuid({
  workspaceId,
  logUuid,
}: {
  workspaceId: number
  logUuid: string
}): Promise<string[]> {
  const result = await clickhouseClient().query({
    query: `
      SELECT DISTINCT trace_id
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid = {logUuid: UUID}
      ORDER BY trace_id ASC
    `,
    format: 'JSONEachRow',
    query_params: { workspaceId, logUuid },
  })

  const rows = await result.json<{ trace_id: string }>()
  return rows.map((r) => r.trace_id)
}

export async function findByDocumentLogUuids({
  workspaceId,
  documentLogUuids,
}: {
  workspaceId: number
  documentLogUuids: string[]
}): Promise<Span[]> {
  if (documentLogUuids.length === 0) return []

  const result = await clickhouseClient().query({
    query: `
      SELECT *
      FROM ${SPANS_TABLE} FINAL
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid IN ({documentLogUuids: Array(UUID)})
    `,
    format: 'JSONEachRow',
    query_params: { workspaceId, documentLogUuids },
  })

  const rows = await result.json<SpanRow>()
  return rows.map(spanRowToSpan)
}

export async function findByDocumentLogUuid({
  workspaceId,
  documentLogUuid,
}: {
  workspaceId: number
  documentLogUuid: string
}): Promise<Span | undefined> {
  const result = await clickhouseClient().query({
    query: `
      SELECT *
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid = {documentLogUuid: UUID}
      ORDER BY ingested_at DESC
      LIMIT 1
    `,
    format: 'JSONEachRow',
    query_params: { workspaceId, documentLogUuid },
  })

  const rows = await result.json<SpanRow>()
  if (rows.length === 0) return undefined
  return spanRowToSpan(rows[0]!)
}

export async function listByDocumentLogUuid({
  workspaceId,
  documentLogUuid,
}: {
  workspaceId: number
  documentLogUuid: string
}): Promise<Span[]> {
  const result = await clickhouseClient().query({
    query: `
      SELECT *
      FROM ${SPANS_TABLE} FINAL
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid = {documentLogUuid: UUID}
      ORDER BY started_at ASC, span_id ASC
    `,
    format: 'JSONEachRow',
    query_params: { workspaceId, documentLogUuid },
  })

  const rows = await result.json<SpanRow>()
  return rows.map(spanRowToSpan)
}

export async function findLastMainSpanByDocumentLogUuid({
  workspaceId,
  documentLogUuid,
}: {
  workspaceId: number
  documentLogUuid: string
}): Promise<Span | undefined> {
  const mainTypes = Array.from(MAIN_SPAN_TYPES)

  const result = await clickhouseClient().query({
    query: `
      SELECT *
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid = {documentLogUuid: UUID}
        AND type IN ({mainTypes: Array(String)})
      ORDER BY started_at DESC
      LIMIT 1
    `,
    format: 'JSONEachRow',
    query_params: { workspaceId, documentLogUuid, mainTypes },
  })

  const rows = await result.json<SpanRow>()
  if (rows.length === 0) return undefined
  return spanRowToSpan(rows[0]!)
}

export async function findFirstMainSpanByDocumentLogUuid({
  workspaceId,
  documentLogUuid,
}: {
  workspaceId: number
  documentLogUuid: string
}): Promise<Span | undefined> {
  const mainTypes = Array.from(MAIN_SPAN_TYPES)

  const result = await clickhouseClient().query({
    query: `
      SELECT *
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid = {documentLogUuid: UUID}
        AND type IN ({mainTypes: Array(String)})
      ORDER BY started_at ASC
      LIMIT 1
    `,
    format: 'JSONEachRow',
    query_params: { workspaceId, documentLogUuid, mainTypes },
  })

  const rows = await result.json<SpanRow>()
  if (rows.length === 0) return undefined
  return spanRowToSpan(rows[0]!)
}

export async function getSpanIdentifiersByDocumentLogUuids({
  workspaceId,
  documentLogUuids,
}: {
  workspaceId: number
  documentLogUuids: string[]
}): Promise<Array<{ traceId: string; spanId: string }>> {
  if (documentLogUuids.length === 0) return []

  const result = await clickhouseClient().query({
    query: `
      SELECT trace_id, span_id
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid IN ({documentLogUuids: Array(UUID)})
    `,
    format: 'JSONEachRow',
    query_params: { workspaceId, documentLogUuids },
  })

  const rows = await result.json<{ trace_id: string; span_id: string }>()
  return rows.map((r) => ({ traceId: r.trace_id, spanId: r.span_id }))
}

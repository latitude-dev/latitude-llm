import { MAIN_SPAN_TYPES, Span } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME, SpanRow } from '../../../schema/models/clickhouse/spans'
import { scopedQuery } from '../../scope'
import { mapRow } from './toSpan'

type PkFilters = {
  projectId?: number
  commitUuid?: string
  documentUuid?: string
}

function buildPkConditions({ projectId, commitUuid, documentUuid }: PkFilters) {
  const conditions: string[] = []
  const params: Record<string, unknown> = {}

  if (projectId !== undefined) {
    conditions.push('project_id_key = {projectId: UInt64}')
    params.projectId = projectId
  }
  if (commitUuid) {
    // TODO(clickhouse): remove non-_key predicate after key-column rollout.
    conditions.push('commit_uuid = {commitUuid: UUID}')
    conditions.push('commit_uuid_key = {commitUuid: UUID}')
    params.commitUuid = commitUuid
  }
  if (documentUuid) {
    // TODO(clickhouse): remove non-_key predicate after key-column rollout.
    conditions.push('document_uuid = {documentUuid: UUID}')
    conditions.push('document_uuid_key = {documentUuid: UUID}')
    params.documentUuid = documentUuid
  }

  return { conditions, params }
}

export const getLastTraceByLogUuid = scopedQuery(
  async function getLastTraceByLogUuid({
    workspaceId,
    logUuid,
    ...pkFilters
  }: {
    workspaceId: number
    logUuid: string
  } & PkFilters): Promise<string | undefined> {
    const { conditions: pkConditions, params: pkParams } =
      buildPkConditions(pkFilters)

    const result = await clickhouseClient().query({
      query: `
      SELECT trace_id
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid = {logUuid: UUID}
        ${pkConditions.map((c) => `AND ${c}`).join('\n        ')}
      ORDER BY started_at DESC
      LIMIT 1
    `,
      format: 'JSONEachRow',
      query_params: { workspaceId, logUuid, ...pkParams },
    })

    const rows = await result.json<{ trace_id: string }>()
    return rows[0]?.trace_id
  },
)

export const listTraceIdsByLogUuid = scopedQuery(
  async function listTraceIdsByLogUuid({
    workspaceId,
    logUuid,
    ...pkFilters
  }: {
    workspaceId: number
    logUuid: string
  } & PkFilters): Promise<string[]> {
    const { conditions: pkConditions, params: pkParams } =
      buildPkConditions(pkFilters)

    const result = await clickhouseClient().query({
      query: `
      SELECT DISTINCT trace_id
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid = {logUuid: UUID}
        ${pkConditions.map((c) => `AND ${c}`).join('\n        ')}
      ORDER BY trace_id ASC
    `,
      format: 'JSONEachRow',
      query_params: { workspaceId, logUuid, ...pkParams },
    })

    const rows = await result.json<{ trace_id: string }>()
    return rows.map((r) => r.trace_id)
  },
)

export const findByDocumentLogUuids = scopedQuery(
  async function findByDocumentLogUuids({
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
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid IN ({documentLogUuids: Array(UUID)})
    `,
      format: 'JSONEachRow',
      query_params: { workspaceId, documentLogUuids },
    })

    const rows = await result.json<SpanRow>()
    return rows.map(mapRow)
  },
)

export const findByDocumentLogUuid = scopedQuery(
  async function findByDocumentLogUuid({
    workspaceId,
    documentLogUuid,
    ...pkFilters
  }: {
    workspaceId: number
    documentLogUuid: string
  } & PkFilters): Promise<Span | undefined> {
    const { conditions: pkConditions, params: pkParams } =
      buildPkConditions(pkFilters)

    const result = await clickhouseClient().query({
      query: `
      SELECT *
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid = {documentLogUuid: UUID}
        ${pkConditions.map((c) => `AND ${c}`).join('\n        ')}
      ORDER BY ingested_at DESC
      LIMIT 1
    `,
      format: 'JSONEachRow',
      query_params: { workspaceId, documentLogUuid, ...pkParams },
    })

    const rows = await result.json<SpanRow>()
    if (rows.length === 0) return undefined
    return mapRow(rows[0]!)
  },
)

export const listByDocumentLogUuid = scopedQuery(
  async function listByDocumentLogUuid({
    workspaceId,
    documentLogUuid,
    ...pkFilters
  }: {
    workspaceId: number
    documentLogUuid: string
  } & PkFilters): Promise<Span[]> {
    const { conditions: pkConditions, params: pkParams } =
      buildPkConditions(pkFilters)

    const result = await clickhouseClient().query({
      query: `
      SELECT *
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid = {documentLogUuid: UUID}
        ${pkConditions.map((c) => `AND ${c}`).join('\n        ')}
      ORDER BY started_at ASC, span_id ASC
    `,
      format: 'JSONEachRow',
      query_params: { workspaceId, documentLogUuid, ...pkParams },
    })

    const rows = await result.json<SpanRow>()
    return rows.map(mapRow)
  },
)

export const findLastMainSpanByDocumentLogUuid = scopedQuery(
  async function findLastMainSpanByDocumentLogUuid({
    workspaceId,
    documentLogUuid,
    ...pkFilters
  }: {
    workspaceId: number
    documentLogUuid: string
  } & PkFilters): Promise<Span | undefined> {
    const mainTypes = Array.from(MAIN_SPAN_TYPES)
    const { conditions: pkConditions, params: pkParams } =
      buildPkConditions(pkFilters)

    const result = await clickhouseClient().query({
      query: `
      SELECT *
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid = {documentLogUuid: UUID}
        AND type IN ({mainTypes: Array(String)})
        ${pkConditions.map((c) => `AND ${c}`).join('\n        ')}
      ORDER BY started_at DESC
      LIMIT 1
    `,
      format: 'JSONEachRow',
      query_params: { workspaceId, documentLogUuid, mainTypes, ...pkParams },
    })

    const rows = await result.json<SpanRow>()
    if (rows.length === 0) return undefined
    return mapRow(rows[0]!)
  },
)

export const findFirstMainSpanByDocumentLogUuid = scopedQuery(
  async function findFirstMainSpanByDocumentLogUuid({
    workspaceId,
    documentLogUuid,
    ...pkFilters
  }: {
    workspaceId: number
    documentLogUuid: string
  } & PkFilters): Promise<Span | undefined> {
    const mainTypes = Array.from(MAIN_SPAN_TYPES)
    const { conditions: pkConditions, params: pkParams } =
      buildPkConditions(pkFilters)

    const result = await clickhouseClient().query({
      query: `
      SELECT *
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid = {documentLogUuid: UUID}
        AND type IN ({mainTypes: Array(String)})
        ${pkConditions.map((c) => `AND ${c}`).join('\n        ')}
      ORDER BY started_at ASC
      LIMIT 1
    `,
      format: 'JSONEachRow',
      query_params: { workspaceId, documentLogUuid, mainTypes, ...pkParams },
    })

    const rows = await result.json<SpanRow>()
    if (rows.length === 0) return undefined
    return mapRow(rows[0]!)
  },
)

export const getSpanIdentifiersByDocumentLogUuids = scopedQuery(
  async function getSpanIdentifiersByDocumentLogUuids({
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
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid IN ({documentLogUuids: Array(UUID)})
    `,
      format: 'JSONEachRow',
      query_params: { workspaceId, documentLogUuids },
    })

    const rows = await result.json<{ trace_id: string; span_id: string }>()
    return rows.map((r) => ({ traceId: r.trace_id, spanId: r.span_id }))
  },
)

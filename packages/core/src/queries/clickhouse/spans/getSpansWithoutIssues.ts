import {
  LogSources,
  MainSpanType,
  Span,
  SpanStatus,
} from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE, SpanRow } from '../../../clickhouse/models/spans'
import { toClickHouseDateTime } from '../../../clickhouse/insert'
import { Cursor } from '../../../schema/types'
import { buildExperimentExclusionCondition } from './buildExperimentExclusionCondition'
import { paginateSpanRows } from './paginateSpanRows'

export async function getSpansWithoutIssues({
  workspaceId,
  documentUuid,
  commitUuids,
  spanTypes,
  excludedSpanIds,
  excludedTraceIds,
  optimizationExperimentUuids,
  cursor,
  limit,
}: {
  workspaceId: number
  documentUuid: string
  commitUuids: string[]
  spanTypes: MainSpanType[]
  excludedSpanIds?: string[]
  excludedTraceIds?: string[]
  optimizationExperimentUuids: string[]
  cursor: Cursor<Date, string> | null
  limit: number
}): Promise<{
  spans: Span<MainSpanType>[]
  next: Cursor<Date, string> | null
}> {
  if (commitUuids.length === 0) {
    return { spans: [], next: null }
  }

  const params: Record<string, unknown> = {
    workspaceId,
    documentUuid,
    commitUuids,
    spanTypes,
    okStatus: SpanStatus.Ok,
    optimizationSource: LogSources.Optimization,
    experimentSource: LogSources.Experiment,
    fetchLimit: limit + 1,
  }

  const conditions = [
    `workspace_id = {workspaceId: UInt64}`,
    `document_uuid = {documentUuid: UUID}`,
    `commit_uuid IN ({commitUuids: Array(UUID)})`,
    `type IN ({spanTypes: Array(String)})`,
    `status = {okStatus: String}`,
    `source != {optimizationSource: String}`,
  ]

  if (excludedSpanIds && excludedSpanIds.length > 0) {
    params.excludedSpanIds = excludedSpanIds
    conditions.push(`span_id NOT IN ({excludedSpanIds: Array(String)})`)
  }

  if (excludedTraceIds && excludedTraceIds.length > 0) {
    params.excludedTraceIds = excludedTraceIds
    conditions.push(`trace_id NOT IN ({excludedTraceIds: Array(String)})`)
  }

  conditions.push(
    buildExperimentExclusionCondition(optimizationExperimentUuids, params),
  )

  if (cursor) {
    params.cursorStartedAt = toClickHouseDateTime(cursor.value)
    params.cursorId = cursor.id
    conditions.push(
      `(started_at, span_id) < ({cursorStartedAt: DateTime64(6, 'UTC')}, {cursorId: String})`,
    )
  }

  const result = await clickhouseClient().query({
    query: `
      SELECT *
      FROM ${SPANS_TABLE}
      WHERE ${conditions.join(' AND ')}
      ORDER BY started_at DESC, span_id DESC
      LIMIT {fetchLimit: UInt32}
    `,
    format: 'JSONEachRow',
    query_params: params,
  })

  const rows = await result.json<SpanRow>()
  return paginateSpanRows(rows, limit)
}

export async function getSpansWithActiveIssues({
  workspaceId,
  evaluationResultIds,
}: {
  workspaceId: number
  evaluationResultIds: number[]
}): Promise<{ spanIds: string[]; traceIds: string[] }> {
  if (evaluationResultIds.length === 0) {
    return { spanIds: [], traceIds: [] }
  }

  // When filtering by specific evaluation result IDs, we don't need other filters
  const result = await clickhouseClient().query({
    query: `
      SELECT DISTINCT
        evaluated_span_id,
        evaluated_trace_id
      FROM evaluation_results
      WHERE workspace_id = {workspaceId: UInt64}
        AND evaluated_span_id IS NOT NULL
        AND id IN ({evaluationResultIds: Array(UInt64)})
    `,
    format: 'JSONEachRow',
    query_params: {
      workspaceId,
      evaluationResultIds,
    },
  })

  const rows = await result.json<{
    evaluated_span_id: string
    evaluated_trace_id: string
  }>()

  return {
    spanIds: rows.map((r) => r.evaluated_span_id).filter(Boolean),
    traceIds: rows.map((r) => r.evaluated_trace_id).filter(Boolean),
  }
}

export async function getSpansWithFailedResults({
  workspaceId,
  documentUuid,
  commitUuids,
}: {
  workspaceId: number
  documentUuid: string
  commitUuids: string[]
}): Promise<{ spanIds: string[]; traceIds: string[] }> {
  if (commitUuids.length === 0) {
    return { spanIds: [], traceIds: [] }
  }

  const result = await clickhouseClient().query({
    query: `
      SELECT DISTINCT
        evaluated_span_id,
        evaluated_trace_id
      FROM evaluation_results
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_uuid = {documentUuid: UUID}
        AND commit_uuid IN ({commitUuids: Array(UUID)})
        AND evaluated_span_id IS NOT NULL
        AND has_passed = 0
    `,
    format: 'JSONEachRow',
    query_params: {
      workspaceId,
      documentUuid,
      commitUuids,
    },
  })

  const rows = await result.json<{
    evaluated_span_id: string
    evaluated_trace_id: string
  }>()

  return {
    spanIds: rows.map((r) => r.evaluated_span_id).filter(Boolean),
    traceIds: rows.map((r) => r.evaluated_trace_id).filter(Boolean),
  }
}

export async function getSpansWithPassedResults({
  workspaceId,
  documentUuid,
  commitUuids,
  requireHumanEvaluation,
}: {
  workspaceId: number
  documentUuid: string
  commitUuids: string[]
  requireHumanEvaluation: boolean
}): Promise<{ spanIds: string[]; traceIds: string[] }> {
  if (commitUuids.length === 0) {
    return { spanIds: [], traceIds: [] }
  }

  const params: Record<string, unknown> = {
    workspaceId,
    documentUuid,
    commitUuids,
  }

  let typeCondition = ''
  if (requireHumanEvaluation) {
    params.evaluationType = 'human'
    typeCondition = `AND type = {evaluationType: String}`
  }

  const result = await clickhouseClient().query({
    query: `
      SELECT DISTINCT
        evaluated_span_id,
        evaluated_trace_id
      FROM evaluation_results
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_uuid = {documentUuid: UUID}
        AND commit_uuid IN ({commitUuids: Array(UUID)})
        AND evaluated_span_id IS NOT NULL
        AND has_passed = 1
        ${typeCondition}
    `,
    format: 'JSONEachRow',
    query_params: params,
  })

  const rows = await result.json<{
    evaluated_span_id: string
    evaluated_trace_id: string
  }>()

  return {
    spanIds: rows.map((r) => r.evaluated_span_id).filter(Boolean),
    traceIds: rows.map((r) => r.evaluated_trace_id).filter(Boolean),
  }
}

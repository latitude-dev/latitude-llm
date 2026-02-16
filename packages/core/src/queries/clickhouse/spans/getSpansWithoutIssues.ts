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
import { spanRowToSpan } from './toSpan'

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
    `document_uuid = {documentUuid: String}`,
    `commit_uuid IN ({commitUuids: Array(String)})`,
    `type IN ({spanTypes: Array(String)})`,
    `status = {okStatus: String}`,
    `source != {optimizationSource: String}`,
  ]

  // Exclude spans with active issues
  if (excludedSpanIds && excludedSpanIds.length > 0) {
    params.excludedSpanIds = excludedSpanIds
    conditions.push(`span_id NOT IN ({excludedSpanIds: Array(String)})`)
  }

  if (excludedTraceIds && excludedTraceIds.length > 0) {
    params.excludedTraceIds = excludedTraceIds
    conditions.push(`trace_id NOT IN ({excludedTraceIds: Array(String)})`)
  }

  // Exclude optimization experiment spans
  const experimentConditions = [
    `source != {experimentSource: String}`,
    `experiment_uuid IS NULL`,
  ]

  if (optimizationExperimentUuids.length > 0) {
    params.optimizationExperimentUuids = optimizationExperimentUuids
    experimentConditions.push(
      `experiment_uuid NOT IN ({optimizationExperimentUuids: Array(String)})`,
    )
  }

  conditions.push(`(${experimentConditions.join(' OR ')})`)

  // Cursor pagination
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
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows

  const spans = items.map((row) => spanRowToSpan(row) as Span<MainSpanType>)

  const lastItem = spans.length > 0 ? spans[spans.length - 1] : null
  const next =
    hasMore && lastItem
      ? {
          value: lastItem.startedAt,
          id: lastItem.id,
        }
      : null

  return { spans, next }
}

export async function getSpansWithActiveIssues({
  workspaceId,
  documentUuid,
  commitIds,
  evaluationResultIds,
}: {
  workspaceId: number
  documentUuid: string
  commitIds: number[]
  evaluationResultIds: number[]
}): Promise<{ spanIds: string[]; traceIds: string[] }> {
  if (evaluationResultIds.length === 0) {
    return { spanIds: [], traceIds: [] }
  }

  // Query ClickHouse evaluation_results table to get span/trace IDs
  const result = await clickhouseClient().query({
    query: `
      SELECT DISTINCT
        evaluated_span_id,
        evaluated_trace_id
      FROM evaluation_results
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_uuid = {documentUuid: UUID}
        AND commit_id IN ({commitIds: Array(UInt64)})
        AND evaluated_span_id IS NOT NULL
        AND id IN ({evaluationResultIds: Array(UInt64)})
    `,
    format: 'JSONEachRow',
    query_params: {
      workspaceId,
      documentUuid,
      commitIds,
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
  commitIds,
}: {
  workspaceId: number
  documentUuid: string
  commitIds: number[]
}): Promise<{ spanIds: string[]; traceIds: string[] }> {
  if (commitIds.length === 0) {
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
        AND commit_id IN ({commitIds: Array(UInt64)})
        AND evaluated_span_id IS NOT NULL
        AND has_passed = 0
    `,
    format: 'JSONEachRow',
    query_params: {
      workspaceId,
      documentUuid,
      commitIds,
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
  commitIds,
  requireHumanEvaluation,
}: {
  workspaceId: number
  documentUuid: string
  commitIds: number[]
  requireHumanEvaluation: boolean
}): Promise<{ spanIds: string[]; traceIds: string[] }> {
  if (commitIds.length === 0) {
    return { spanIds: [], traceIds: [] }
  }

  const params: Record<string, unknown> = {
    workspaceId,
    documentUuid,
    commitIds,
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
        AND commit_id IN ({commitIds: Array(UInt64)})
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

import { Span, SpanType } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE, SpanRow } from '../../../clickhouse/models/spans'
import { spanRowToSpan } from './toSpan'

export async function findBySpanAndTraceIds({
  workspaceId,
  pairs,
}: {
  workspaceId: number
  pairs: Array<{ spanId: string; traceId: string }>
}): Promise<Span[]> {
  if (pairs.length === 0) return []

  const tuples = pairs
    .map((_, i) => `({spanId_${i}: String}, {traceId_${i}: String})`)
    .join(', ')

  const params: Record<string, unknown> = { workspaceId }
  for (let i = 0; i < pairs.length; i++) {
    params[`spanId_${i}`] = pairs[i]!.spanId
    params[`traceId_${i}`] = pairs[i]!.traceId
  }

  const result = await clickhouseClient().query({
    query: `
      SELECT *
      FROM ${SPANS_TABLE} FINAL
      WHERE workspace_id = {workspaceId: UInt64}
        AND (span_id, trace_id) IN (${tuples})
      ORDER BY started_at ASC, span_id ASC
    `,
    format: 'JSONEachRow',
    query_params: params,
  })

  const rows = await result.json<SpanRow>()
  return rows.map(spanRowToSpan)
}

export async function findByParentAndType({
  workspaceId,
  parentId,
  type,
}: {
  workspaceId: number
  parentId: string
  type: SpanType
}): Promise<Span[]> {
  const result = await clickhouseClient().query({
    query: `
      SELECT *
      FROM ${SPANS_TABLE} FINAL
      WHERE workspace_id = {workspaceId: UInt64}
        AND parent_id = {parentId: String}
        AND type = {type: String}
    `,
    format: 'JSONEachRow',
    query_params: { workspaceId, parentId, type },
  })

  const rows = await result.json<SpanRow>()
  return rows.map(spanRowToSpan)
}

export async function findCompletionsByParentIds({
  workspaceId,
  parentIds,
}: {
  workspaceId: number
  parentIds: Array<{ traceId: string; spanId: string }>
}): Promise<Map<string, Span<SpanType.Completion>>> {
  if (parentIds.length === 0) return new Map()

  const spanIds = parentIds.map((p) => p.spanId)

  const result = await clickhouseClient().query({
    query: `
      SELECT *
      FROM ${SPANS_TABLE} FINAL
      WHERE workspace_id = {workspaceId: UInt64}
        AND type = {type: String}
        AND parent_id IN ({spanIds: Array(String)})
    `,
    format: 'JSONEachRow',
    query_params: {
      workspaceId,
      type: SpanType.Completion,
      spanIds,
    },
  })

  const rows = await result.json<SpanRow>()
  const completionsByParent = new Map<string, Span<SpanType.Completion>>()

  for (const row of rows) {
    if (row.parent_id) {
      const parentKey = `${row.trace_id}:${row.parent_id}`
      if (!completionsByParent.has(parentKey)) {
        completionsByParent.set(
          parentKey,
          spanRowToSpan(row) as Span<SpanType.Completion>,
        )
      }
    }
  }

  return completionsByParent
}

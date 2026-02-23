import { Span, SpanType } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME, SpanRow } from '../../../schema/models/clickhouse/spans'
import { scopedQuery } from '../../scope'
import { PkFilters, buildPkConditions } from './pkFilters'
import { mapRow } from './toSpan'

export const findBySpanAndTraceIdPairs = scopedQuery(
  async function findBySpanAndTraceIdPairs({
    workspaceId,
    pairs,
    ...pkFilters
  }: {
    workspaceId: number
    pairs: Array<{ spanId: string; traceId: string }>
  } & PkFilters): Promise<Span[]> {
    if (pairs.length === 0) return []

    const { conditions: pkConditions, params: pkParams } =
      buildPkConditions(pkFilters)

    const tuples = pairs
      .map((_, i) => `({spanId_${i}: String}, {traceId_${i}: String})`)
      .join(', ')

    const params: Record<string, unknown> = { workspaceId, ...pkParams }
    for (let i = 0; i < pairs.length; i++) {
      params[`spanId_${i}`] = pairs[i]!.spanId
      params[`traceId_${i}`] = pairs[i]!.traceId
    }

    const result = await clickhouseClient().query({
      query: `
      SELECT *
      FROM ${TABLE_NAME} FINAL
      WHERE workspace_id = {workspaceId: UInt64}
        AND (span_id, trace_id) IN (${tuples})
        ${pkConditions.map((c) => `AND ${c}`).join('\n        ')}
      ORDER BY started_at ASC, span_id ASC
    `,
      format: 'JSONEachRow',
      query_params: params,
    })

    const rows = await result.json<SpanRow>()
    return rows.map(mapRow)
  },
)

export const findByParentAndType = scopedQuery(
  async function findByParentAndType({
    workspaceId,
    parentId,
    type,
    ...pkFilters
  }: {
    workspaceId: number
    parentId: string
    type: SpanType
  } & PkFilters): Promise<Span[]> {
    const { conditions: pkConditions, params: pkParams } =
      buildPkConditions(pkFilters)

    const result = await clickhouseClient().query({
      query: `
      SELECT *
      FROM ${TABLE_NAME} FINAL
      WHERE workspace_id = {workspaceId: UInt64}
        AND parent_id = {parentId: String}
        AND type = {type: String}
        ${pkConditions.map((c) => `AND ${c}`).join('\n        ')}
    `,
      format: 'JSONEachRow',
      query_params: { workspaceId, parentId, type, ...pkParams },
    })

    const rows = await result.json<SpanRow>()
    return rows.map(mapRow)
  },
)

export const findCompletionsByParentIds = scopedQuery(
  async function findCompletionsByParentIds({
    workspaceId,
    parentIds,
    ...pkFilters
  }: {
    workspaceId: number
    parentIds: Array<{ traceId: string; spanId: string }>
  } & PkFilters): Promise<Map<string, Span<SpanType.Completion>>> {
    if (parentIds.length === 0) return new Map()

    const { conditions: pkConditions, params: pkParams } =
      buildPkConditions(pkFilters)

    const spanIds = parentIds.map((p) => p.spanId)

    const result = await clickhouseClient().query({
      query: `
      SELECT *
      FROM ${TABLE_NAME} FINAL
      WHERE workspace_id = {workspaceId: UInt64}
        AND type = {type: String}
        AND parent_id IN ({spanIds: Array(String)})
        ${pkConditions.map((c) => `AND ${c}`).join('\n        ')}
    `,
      format: 'JSONEachRow',
      query_params: {
        workspaceId,
        type: SpanType.Completion,
        spanIds,
        ...pkParams,
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
            mapRow(row) as Span<SpanType.Completion>,
          )
        }
      }
    }

    return completionsByParent
  },
)

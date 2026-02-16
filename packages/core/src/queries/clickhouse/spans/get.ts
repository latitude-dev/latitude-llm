import { Span } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE, SpanRow } from '../../../clickhouse/models/spans'
import { Result, TypedResult } from '../../../lib/Result'
import { scopedQuery } from '../../scope'
import { spanRowToSpan } from './toSpan'

export const findSpan = scopedQuery(async function findSpan(
  {
    workspaceId,
    spanId,
    traceId,
  }: {
    workspaceId: number
    spanId: string
    traceId: string
  },
  _db,
): Promise<TypedResult<Span | undefined>> {
  const result = await clickhouseClient().query({
    query: `
      SELECT *
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND trace_id = {traceId: String}
        AND span_id = {spanId: String}
      ORDER BY ingested_at DESC
      LIMIT 1
    `,
    format: 'JSONEachRow',
    query_params: { workspaceId, traceId, spanId },
  })

  const rows = await result.json<SpanRow>()
  if (rows.length === 0) return Result.nil()
  return Result.ok(spanRowToSpan(rows[0]!))
})

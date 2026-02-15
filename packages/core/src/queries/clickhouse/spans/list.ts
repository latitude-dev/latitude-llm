import { Span } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE, SpanRow } from '../../../clickhouse/models/spans'
import { Result, TypedResult } from '../../../lib/Result'
import { spanRowToSpan } from './toSpan'

export async function listSpans({
  workspaceId,
  traceId,
}: {
  workspaceId: number
  traceId: string
}): Promise<TypedResult<Span[]>> {
  const result = await clickhouseClient().query({
    query: `
      SELECT *
      FROM ${SPANS_TABLE} FINAL
      WHERE workspace_id = {workspaceId: UInt64}
        AND trace_id = {traceId: String}
      ORDER BY started_at ASC, span_id ASC
    `,
    format: 'JSONEachRow',
    query_params: { workspaceId, traceId },
  })

  const rows = await result.json<SpanRow>()
  return Result.ok(rows.map(spanRowToSpan))
}

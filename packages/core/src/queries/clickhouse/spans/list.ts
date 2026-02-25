import { Span } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME, SpanRow } from '../../../schema/models/clickhouse/spans'
import { Result, TypedResult } from '../../../lib/Result'
import { scopedQuery } from '../../scope'
import { mapRow } from './toSpan'

export const findSpans = scopedQuery(async function findSpans({
  workspaceId,
  traceId,
}: {
  workspaceId: number
  traceId: string
}): Promise<TypedResult<Span[]>> {
  const result = await clickhouseClient().query({
    query: `
      SELECT *
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND trace_id = {traceId: String}
      ORDER BY started_at ASC, span_id ASC
    `,
    format: 'JSONEachRow',
    query_params: { workspaceId, traceId },
  })

  const rows = await result.json<SpanRow>()
  return Result.ok(rows.map(mapRow))
})

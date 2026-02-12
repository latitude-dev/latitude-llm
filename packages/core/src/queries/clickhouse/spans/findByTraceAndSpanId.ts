import { clickhouseClient } from '../../../client/clickhouse'
import { SpanRow, SPANS_TABLE } from '../../../clickhouse/models/spans'
import { scopedQuery } from '../../scope'

export const findSpanByTraceAndSpanId = scopedQuery(
  async function findSpanByTraceAndSpanId(
    {
      workspaceId,
      traceId,
      spanId,
    }: { workspaceId: number; traceId: string; spanId: string },
    _db,
  ): Promise<SpanRow | null> {
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
    return rows[0] ?? null
  },
)

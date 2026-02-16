import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE } from '../../../clickhouse/models/spans'
import { toClickHouseDateTime } from '../../../clickhouse/insert'

export async function countDistinctTracesSince({
  workspaceId,
  since,
}: {
  workspaceId: number
  since: Date
}) {
  const result = await clickhouseClient().query({
    query: `
      SELECT countDistinct(trace_id) AS cnt
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND started_at >= {since: DateTime64(6, 'UTC')}
    `,
    format: 'JSONEachRow',
    query_params: {
      workspaceId,
      since: toClickHouseDateTime(since),
    },
  })

  const rows = await result.json<{ cnt: string }>()
  return Number(rows[0]?.cnt ?? 0)
}

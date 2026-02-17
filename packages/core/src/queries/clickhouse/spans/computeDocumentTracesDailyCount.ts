import { subDays } from 'date-fns'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE } from '../../../clickhouse/models/spans'
import { toClickHouseDateTime } from '../../../clickhouse/insert'
import { scopedQuery } from '../../scope'

export type DailyCount = {
  date: string
  count: number
}

export const computeDocumentTracesDailyCount = scopedQuery(
  async function computeDocumentTracesDailyCount(
    {
      workspaceId,
      documentUuid,
      commitUuid,
      days = 30,
    }: {
      workspaceId: number
      documentUuid: string
      commitUuid?: string
      days?: number
    },
    _db,
  ): Promise<DailyCount[]> {
    const now = new Date()
    const startDate = subDays(now, days)

    const params: Record<string, unknown> = {
      workspaceId,
      documentUuid,
      startDate: toClickHouseDateTime(startDate),
    }

    const conditions = [
      `workspace_id = {workspaceId: UInt64}`,
      // TODO(clickhouse): remove non-_key predicate after key-column rollout.
      `document_uuid = {documentUuid: UUID}`,
      `document_uuid_key = {documentUuid: UUID}`,
      `started_at >= {startDate: DateTime64(6, 'UTC')}`,
    ]

    if (commitUuid) {
      params.commitUuid = commitUuid
      // TODO(clickhouse): remove non-_key predicate after key-column rollout.
      conditions.push(`commit_uuid = {commitUuid: UUID}`)
      conditions.push(`commit_uuid_key = {commitUuid: UUID}`)
    }

    const result = await clickhouseClient().query({
      query: `
      SELECT
        toDate(started_at) AS date,
        count(DISTINCT trace_id) AS count
      FROM ${SPANS_TABLE}
      WHERE ${conditions.join(' AND ')}
      GROUP BY date
      ORDER BY date
    `,
      format: 'JSONEachRow',
      query_params: params,
    })

    const rows = await result.json<{ date: string; count: string }>()

    return rows.map((row) => ({
      date: row.date,
      count: Number(row.count),
    }))
  },
)

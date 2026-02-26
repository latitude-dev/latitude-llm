import { subDays } from 'date-fns'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/spans'
import { toClickHouseDateTime } from '../../../clickhouse/insert'
import { scopedQuery } from '../../scope'

export type DailyCount = {
  date: string
  count: number
}

export const computeDocumentTracesDailyCount = scopedQuery(
  async function computeDocumentTracesDailyCount({
    workspaceId,
    projectId,
    documentUuid,
    commitUuids,
    days = 30,
  }: {
    workspaceId: number
    projectId: number
    documentUuid: string
    commitUuids: string[]
    days?: number
  }): Promise<DailyCount[]> {
    const now = new Date()
    const startDate = subDays(now, days)

    const params: Record<string, unknown> = {
      workspaceId,
      projectId,
      documentUuid,
      commitUuids,
      startDate: toClickHouseDateTime(startDate),
    }

    const conditions = [
      `workspace_id = {workspaceId: UInt64}`,
      // TODO(clickhouse): remove non-_key predicate after key-column rollout.
      `project_id = {projectId: UInt64}`,
      `project_id_key = {projectId: UInt64}`,
      // TODO(clickhouse): remove non-_key predicate after key-column rollout.
      `commit_uuid IN ({commitUuids: Array(UUID)})`,
      `commit_uuid_key IN ({commitUuids: Array(UUID)})`,
      // TODO(clickhouse): remove non-_key predicate after key-column rollout.
      `document_uuid = {documentUuid: UUID}`,
      `document_uuid_key = {documentUuid: UUID}`,
      `started_at >= {startDate: DateTime64(6, 'UTC')}`,
    ]

    const result = await clickhouseClient().query({
      query: `
      SELECT
        toDate(started_at) AS date,
        count(DISTINCT trace_id) AS count
      FROM ${TABLE_NAME}
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

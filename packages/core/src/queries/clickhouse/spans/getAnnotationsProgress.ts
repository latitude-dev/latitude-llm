import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/spans'
import { toClickHouseDateTime } from '../../../clickhouse/insert'
import { LogSources } from '@latitude-data/constants'
import { scopedQuery } from '../../scope'

export const countSpansForAnnotations = scopedQuery(
  async function countSpansForAnnotations({
    workspaceId,
    projectId,
    commitUuids,
    logSources,
    fromDate,
    documentUuid,
  }: {
    workspaceId: number
    projectId: number
    commitUuids: string[]
    logSources: LogSources[]
    fromDate: Date
    documentUuid?: string
  }): Promise<number> {
    if (commitUuids.length === 0) return 0

    const params: Record<string, unknown> = {
      workspaceId,
      projectId,
      commitUuids,
      logSources,
      fromDate: toClickHouseDateTime(fromDate),
    }

    const conditions = [
      `workspace_id = {workspaceId: UInt64}`,
      `project_id = {projectId: UInt64}`,
      `project_id_key = {projectId: UInt64}`,
      `commit_uuid IN ({commitUuids: Array(UUID)})`,
      `commit_uuid_key IN ({commitUuids: Array(UUID)})`,
      `(source IN ({logSources: Array(String)}) OR source IS NULL)`,
      `started_at >= {fromDate: DateTime64(6, 'UTC')}`,
    ]

    if (documentUuid) {
      params.documentUuid = documentUuid
      conditions.push(`document_uuid = {documentUuid: UUID}`)
      conditions.push(`document_uuid_key = {documentUuid: UUID}`)
    }

    const result = await clickhouseClient().query({
      query: `
      SELECT count() AS total_count
      FROM ${TABLE_NAME}
      WHERE ${conditions.join('\n        AND ')}
    `,
      format: 'JSONEachRow',
      query_params: params,
    })

    const rows = await result.json<{ total_count: string }>()
    return Number(rows[0]?.total_count ?? 0)
  },
)

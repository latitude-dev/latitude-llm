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
  }: {
    workspaceId: number
    projectId: number
    commitUuids: string[]
    logSources: LogSources[]
    fromDate: Date
  }): Promise<number> {
    if (commitUuids.length === 0) return 0

    const result = await clickhouseClient().query({
      query: `
      SELECT count() AS total_count
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        -- TODO(clickhouse): remove non-_key predicate after key-column rollout.
        AND project_id = {projectId: UInt64}
        AND project_id_key = {projectId: UInt64}
        -- TODO(clickhouse): remove non-_key predicate after key-column rollout.
        AND commit_uuid IN ({commitUuids: Array(UUID)})
        AND commit_uuid_key IN ({commitUuids: Array(UUID)})
        AND (source IN ({logSources: Array(String)}) OR source IS NULL)
        AND started_at >= {fromDate: DateTime64(6, 'UTC')}
    `,
      format: 'JSONEachRow',
      query_params: {
        workspaceId,
        projectId,
        commitUuids,
        logSources,
        fromDate: toClickHouseDateTime(fromDate),
      },
    })

    const rows = await result.json<{ total_count: string }>()
    return Number(rows[0]?.total_count ?? 0)
  },
)

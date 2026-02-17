import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE } from '../../../clickhouse/models/spans'
import { toClickHouseDateTime } from '../../../clickhouse/insert'
import { LogSources } from '@latitude-data/constants'
import { scopedQuery } from '../../scope'

export const countSpansForAnnotations = scopedQuery(
  async function countSpansForAnnotations(
    {
      workspaceId,
      commitUuids,
      logSources,
      fromDate,
    }: {
      workspaceId: number
      commitUuids: string[]
      logSources: LogSources[]
      fromDate: Date
    },
    _db,
  ): Promise<number> {
    if (commitUuids.length === 0) return 0

    const result = await clickhouseClient().query({
      query: `
      SELECT count() AS total_count
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND commit_uuid IN ({commitUuids: Array(UUID)})
        AND (source IN ({logSources: Array(String)}) OR source IS NULL)
        AND started_at >= {fromDate: DateTime64(6, 'UTC')}
    `,
      format: 'JSONEachRow',
      query_params: {
        workspaceId,
        commitUuids,
        logSources,
        fromDate: toClickHouseDateTime(fromDate),
      },
    })

    const rows = await result.json<{ total_count: string }>()
    return Number(rows[0]?.total_count ?? 0)
  },
)

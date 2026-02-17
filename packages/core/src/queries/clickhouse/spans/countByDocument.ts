import { LogSources } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE } from '../../../clickhouse/models/spans'
import { scopedQuery } from '../../scope'

export const countDistinctTracesByDocument = scopedQuery(
  async function countDistinctTracesByDocument(
    {
      workspaceId,
      documentUuid,
      commitUuids,
      logSources,
    }: {
      workspaceId: number
      documentUuid: string
      commitUuids: string[]
      logSources?: LogSources[]
    },
    _db,
  ) {
    if (commitUuids.length === 0) return 0

    const queryParams: Record<string, unknown> = {
      workspaceId,
      documentUuid,
      commitUuids,
    }

    const sourceFilter =
      logSources && logSources.length > 0
        ? 'AND source IN ({logSources: Array(String)})'
        : ''

    if (logSources && logSources.length > 0) {
      queryParams.logSources = logSources
    }

    const result = await clickhouseClient().query({
      query: `
      SELECT count(DISTINCT trace_id) AS cnt
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_uuid = {documentUuid: UUID}
        AND commit_uuid IN ({commitUuids: Array(UUID)})
        ${sourceFilter}
    `,
      format: 'JSONEachRow',
      query_params: queryParams,
    })

    const rows = await result.json<{ cnt: string }>()
    return Number(rows[0]?.cnt ?? 0)
  },
)

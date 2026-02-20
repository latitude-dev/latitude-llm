import { LogSources } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/spans'
import { scopedQuery } from '../../scope'

export const countDistinctTracesByDocument = scopedQuery(
  async function countDistinctTracesByDocument(
    {
      workspaceId,
      projectId,
      documentUuid,
      commitUuids,
      logSources,
    }: {
      workspaceId: number
      projectId: number
      documentUuid: string
      commitUuids: string[]
      logSources?: LogSources[]
    },
  ) {
    if (commitUuids.length === 0) return 0

    const queryParams: Record<string, unknown> = {
      workspaceId,
      projectId,
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
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        -- TODO(clickhouse): remove non-_key predicate after key-column rollout.
        AND project_id = {projectId: UInt64}
        AND project_id_key = {projectId: UInt64}
        -- TODO(clickhouse): remove non-_key predicate after key-column rollout.
        AND document_uuid = {documentUuid: UUID}
        AND document_uuid_key = {documentUuid: UUID}
        -- TODO(clickhouse): remove non-_key predicate after key-column rollout.
        AND commit_uuid IN ({commitUuids: Array(UUID)})
        AND commit_uuid_key IN ({commitUuids: Array(UUID)})
        ${sourceFilter}
    `,
      format: 'JSONEachRow',
      query_params: queryParams,
    })

    const rows = await result.json<{ cnt: string }>()
    return Number(rows[0]?.cnt ?? 0)
  },
)

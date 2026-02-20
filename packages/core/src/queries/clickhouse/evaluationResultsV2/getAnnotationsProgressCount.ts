import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'

interface GetAnnotationsProgressCountParams {
  workspaceId: number
  projectId: number
  evaluationUuids: string[]
  commitUuids: string[]
  fromDate: string
}

export const getAnnotationsProgressCount = scopedQuery(
  async function getAnnotationsProgressCount(
    params: GetAnnotationsProgressCountParams,
  ) {
    const { workspaceId, projectId, evaluationUuids, commitUuids, fromDate } =
      params

    if (evaluationUuids.length === 0) return 0

    const query = `
      SELECT count() as cnt
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND project_id = {projectId: UInt64}
        AND evaluation_uuid IN ({evaluationUuids: Array(UUID)})
        AND commit_uuid IN ({commitUuids: Array(UUID)})
        AND created_at >= {fromDate: DateTime64(3)}
        AND (
          has_passed = 1
          OR (
            has_passed = 0
            AND JSONExtractString(metadata, 'reason') != ''
            AND JSONExtractString(metadata, 'reason') IS NOT NULL
          )
        )
    `

    const result = await clickhouseClient().query({
      query,
      format: 'JSONEachRow',
      query_params: {
        workspaceId,
        projectId,
        evaluationUuids,
        commitUuids,
        fromDate,
      },
    })

    const rows = await result.json<{ cnt: number }>()
    return rows[0]?.cnt ?? 0
  },
)

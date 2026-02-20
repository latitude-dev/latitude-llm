import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'

export const countEvaluationResultsSinceDate = scopedQuery(
  async function countEvaluationResultsSinceDate({
    workspaceId,
    since,
  }: {
    workspaceId: number
    since: Date
  }): Promise<number> {
    const result = await clickhouseClient().query({
      query: `
        SELECT count() as count
        FROM ${TABLE_NAME}
        WHERE workspace_id = {workspaceId: UInt64}
          AND has_error = 0
          AND created_at >= {since: DateTime64(3)}
      `,
      format: 'JSONEachRow',
      query_params: {
        workspaceId,
        since: since.toISOString(),
      },
    })

    const rows = await result.json<{ count: number }>()
    return rows[0]?.count ?? 0
  },
)

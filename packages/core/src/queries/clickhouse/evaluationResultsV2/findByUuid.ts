import { clickhouseClient } from '../../../client/clickhouse'
import {
  EVALUATION_RESULTS_V2_TABLE,
  EvaluationResultV2Row,
} from '../../../models/clickhouse/evaluationResultsV2'
import { scopedQuery } from '../../scope'

/**
 * Finds the latest evaluation result row by UUID in ClickHouse.
 */
export const findEvaluationResultV2RowByUuid = scopedQuery(
  async function findEvaluationResultV2RowByUuid(
    { workspaceId, uuid }: { workspaceId: number; uuid: string },
    _db,
  ): Promise<EvaluationResultV2Row | null> {
    const result = await clickhouseClient().query({
      query: `
        SELECT *
        FROM ${EVALUATION_RESULTS_V2_TABLE}
        WHERE workspace_id = {workspaceId: UInt64}
          AND uuid = {uuid: UUID}
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      format: 'JSONEachRow',
      query_params: { workspaceId, uuid },
    })

    const rows = await result.json<EvaluationResultV2Row>()
    return rows[0] ?? null
  },
)

import { clickhouseClient } from '../../../client/clickhouse'
import {
  TABLE_NAME,
  EvaluationResultV2Row,
} from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'
import { mapRow } from './mapRow'

/**
 * Finds the latest evaluation result row by ID in ClickHouse.
 */
export const findEvaluationResultById = scopedQuery(
  async function findEvaluationResultV2RowById({
    workspaceId,
    id,
  }: {
    workspaceId: number
    id: number
  }) {
    const result = await clickhouseClient().query({
      query: `
        SELECT *
        FROM ${TABLE_NAME}
        WHERE workspace_id = {workspaceId: UInt64}
          AND id = {id: UInt64}
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      format: 'JSONEachRow',
      query_params: { workspaceId, id },
    })

    const rows = await result
      .json<EvaluationResultV2Row>()
      .then((rows) => rows.map(mapRow))
    return rows[0] ?? null
  },
)

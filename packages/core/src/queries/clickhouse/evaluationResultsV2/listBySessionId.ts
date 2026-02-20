import { clickhouseClient } from '../../../client/clickhouse'
import {
  TABLE_NAME,
  EvaluationResultV2Row,
} from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'
import { mapRow } from './mapRow'

export const listEvaluationResultsBySessionId = scopedQuery(
  async function listEvaluationResultsBySessionId({
    workspaceId,
    sessionId,
  }: {
    workspaceId: number
    sessionId: string
  }) {
    const result = await clickhouseClient().query({
      query: `
        SELECT *
        FROM ${TABLE_NAME}
        WHERE workspace_id = {workspaceId: UInt64}
          AND session_id = {sessionId: String}
        ORDER BY created_at DESC, id DESC
      `,
      format: 'JSONEachRow',
      query_params: { workspaceId, sessionId },
    })

    return await result
      .json<EvaluationResultV2Row>()
      .then((rows) => rows.map(mapRow))
  },
)

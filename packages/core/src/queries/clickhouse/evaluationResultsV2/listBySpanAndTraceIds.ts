import { clickhouseClient } from '../../../client/clickhouse'
import {
  TABLE_NAME,
  EvaluationResultV2Row,
} from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'
import { mapRow } from './mapRow'

export const listEvaluationResultsBySpanAndTraceIds = scopedQuery(
  async function listEvaluationResultsBySpanAndTraceIds({
    workspaceId,
    spanId,
    traceIds,
  }: {
    workspaceId: number
    spanId: string
    traceIds: string[]
  }) {
    const result = await clickhouseClient().query({
      query: `
        SELECT *
        FROM ${TABLE_NAME}
        WHERE workspace_id = {workspaceId: UInt64}
          AND evaluated_span_id = {spanId: String}
          AND evaluated_trace_id IN ({traceIds: Array(String)})
        ORDER BY created_at DESC, id DESC
      `,
      format: 'JSONEachRow',
      query_params: {
        workspaceId,
        spanId,
        traceIds,
      },
    })

    return (await result.json<EvaluationResultV2Row>()).map(mapRow)
  },
)

import { clickhouseClient } from '../../../client/clickhouse'
import {
  TABLE_NAME,
  EvaluationResultV2Row,
} from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'
import { mapRow } from './mapRow'

export const findEvaluationResultBySpanAndEvaluation = scopedQuery(
  async function findEvaluationResultBySpanAndEvaluation({
    workspaceId,
    projectId,
    evaluatedSpanId,
    evaluatedTraceId,
    evaluationUuid,
  }: {
    workspaceId: number
    projectId: number
    evaluatedSpanId: string
    evaluatedTraceId: string
    evaluationUuid: string
  }) {
    const result = await clickhouseClient().query({
      query: `
        SELECT *
        FROM ${TABLE_NAME}
        WHERE workspace_id = {workspaceId: UInt64}
          AND project_id = {projectId: UInt64}
          AND evaluation_uuid = {evaluationUuid: UUID}
          AND evaluated_span_id = {evaluatedSpanId: String}
          AND evaluated_trace_id = {evaluatedTraceId: String}
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      format: 'JSONEachRow',
      query_params: {
        workspaceId,
        projectId,
        evaluatedSpanId,
        evaluatedTraceId,
        evaluationUuid,
      },
    })

    const rows = await result
      .json<EvaluationResultV2Row>()
      .then((rows) => rows.map(mapRow))
    return rows[0] ?? null
  },
)

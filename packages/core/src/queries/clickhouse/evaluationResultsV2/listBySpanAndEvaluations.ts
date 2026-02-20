import { clickhouseClient } from '../../../client/clickhouse'
import {
  TABLE_NAME,
  EvaluationResultV2Row,
} from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'
import { mapRow } from './mapRow'

interface ListBySpanAndEvaluationsParams {
  workspaceId: number
  projectId: number
  spans: { id: string; traceId: string }[]
  evaluationUuids: string[]
}

export const listEvaluationResultsBySpanAndEvaluations = scopedQuery(
  async function listEvaluationResultsBySpanAndEvaluations(
    params: ListBySpanAndEvaluationsParams,
  ) {
    const { workspaceId, projectId, spans, evaluationUuids } = params

    if (!spans.length || !evaluationUuids.length) return []

    const spanIds = spans.map((s) => s.id)
    const traceIds = spans.map((s) => s.traceId)

    const result = await clickhouseClient().query({
      query: `
        SELECT *
        FROM ${TABLE_NAME}
        WHERE workspace_id = {workspaceId: UInt64}
          AND project_id = {projectId: UInt64}
          AND evaluated_span_id IN ({spanIds: Array(String)})
          AND evaluated_trace_id IN ({traceIds: Array(String)})
          AND evaluation_uuid IN ({evaluationUuids: Array(UUID)})
        ORDER BY created_at DESC, id DESC
      `,
      format: 'JSONEachRow',
      query_params: {
        workspaceId,
        projectId,
        spanIds,
        traceIds,
        evaluationUuids,
      },
    })

    return (await result.json<EvaluationResultV2Row>()).map(mapRow)
  },
)

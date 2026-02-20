import { clickhouseClient } from '../../../client/clickhouse'
import {
  TABLE_NAME,
  EvaluationResultV2Row,
} from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'
import { mapRow } from './mapRow'

interface ListBySpansParams {
  workspaceId: number
  spans: { id: string; traceId: string }[]
}

export const listEvaluationResultsBySpans = scopedQuery(
  async function listEvaluationResultsBySpans({
    workspaceId,
    spans,
  }: ListBySpansParams) {
    const valid = spans.filter((s) => Boolean(s.id && s.traceId))
    if (!valid.length) return []

    const tuples = valid
      .map((_, i) => `({spanId_${i}: String}, {traceId_${i}: String})`)
      .join(', ')

    const queryParams: Record<string, unknown> = { workspaceId }

    for (let i = 0; i < valid.length; i++) {
      queryParams[`spanId_${i}`] = valid[i]!.id
      queryParams[`traceId_${i}`] = valid[i]!.traceId
    }

    const result = await clickhouseClient().query({
      query: `
        SELECT *
        FROM ${TABLE_NAME}
        WHERE workspace_id = {workspaceId: UInt64}
          AND (evaluated_span_id, evaluated_trace_id) IN (${tuples})
        ORDER BY created_at DESC, id DESC
      `,
      format: 'JSONEachRow',
      query_params: queryParams,
    })

    return (await result.json<EvaluationResultV2Row>()).map(mapRow)
  },
)

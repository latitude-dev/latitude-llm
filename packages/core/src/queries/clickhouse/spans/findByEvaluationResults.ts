import { MAIN_SPAN_TYPES, Span } from '@latitude-data/constants'
import { EvaluationResultV2 } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME, SpanRow } from '../../../schema/models/clickhouse/spans'
import { scopedQuery } from '../../scope'
import { mapRow } from './toSpan'

export const findByEvaluationResults = scopedQuery(
  async function findByEvaluationResults({
    workspaceId,
    evaluationResults,
  }: {
    workspaceId: number
    evaluationResults: Pick<
      EvaluationResultV2,
      'evaluatedSpanId' | 'evaluatedTraceId'
    >[]
  }): Promise<Span[]> {
    if (evaluationResults.length === 0) return []

    const mainTypes = Array.from(MAIN_SPAN_TYPES)

    const tuples = evaluationResults
      .map((_, i) => `({spanId_${i}: String}, {traceId_${i}: String})`)
      .join(', ')

    const params: Record<string, unknown> = { workspaceId, mainTypes }
    for (let i = 0; i < evaluationResults.length; i++) {
      params[`spanId_${i}`] = evaluationResults[i]!.evaluatedSpanId
      params[`traceId_${i}`] = evaluationResults[i]!.evaluatedTraceId
    }

    const result = await clickhouseClient().query({
      query: `
      SELECT *
      FROM ${TABLE_NAME} FINAL
      WHERE workspace_id = {workspaceId: UInt64}
        AND (span_id, trace_id) IN (${tuples})
        AND type IN ({mainTypes: Array(String)})
    `,
      format: 'JSONEachRow',
      query_params: params,
    })

    const rows = await result.json<SpanRow>()
    const allSpans = rows.map(mapRow)

    const spanMap = new Map<string, Span>()
    for (const span of allSpans) {
      spanMap.set(`${span.id}:${span.traceId}`, span)
    }

    return evaluationResults
      .map(({ evaluatedSpanId, evaluatedTraceId }) =>
        spanMap.get(`${evaluatedSpanId}:${evaluatedTraceId}`),
      )
      .filter((span): span is Span => span !== undefined)
  },
)

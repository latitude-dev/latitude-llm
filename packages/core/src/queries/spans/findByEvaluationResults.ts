import { and, inArray, sql } from 'drizzle-orm'

import { MAIN_SPAN_TYPES, Span } from '../../constants'
import { spans } from '../../schema/models/spans'
import { scopedQuery } from '../scope'
import { tenancyFilter } from './filters'
import { EvaluationResultV2 } from '@latitude-data/constants'

export const findSpansByEvaluationResults = scopedQuery(
  async function findSpansByEvaluationResults(
    {
      workspaceId,
      evaluationResults,
    }: {
      workspaceId: number
      evaluationResults: Pick<
        EvaluationResultV2,
        'evaluatedSpanId' | 'evaluatedTraceId'
      >[]
    },
    db,
  ): Promise<Span[]> {
    if (evaluationResults.length === 0) return []

    const spanTraceIdPairs = evaluationResults.map(
      (result) =>
        sql`(${result.evaluatedSpanId}, ${result.evaluatedTraceId})`,
    )

    const fetchedSpans = await db
      .select()
      .from(spans)
      .where(
        and(
          tenancyFilter(workspaceId),
          sql`(${spans.id}, ${spans.traceId}) IN (${sql.join(spanTraceIdPairs, sql`, `)})`,
          inArray(spans.type, Array.from(MAIN_SPAN_TYPES)),
        ),
      )

    return orderSpansByEvaluationResults(
      evaluationResults,
      fetchedSpans as Span[],
    )
  },
)

function buildSpanKey(spanId: string, traceId: string) {
  return `${spanId}:${traceId}`
}

function orderSpansByEvaluationResults(
  evaluationResults: Pick<
    EvaluationResultV2,
    'evaluatedSpanId' | 'evaluatedTraceId'
  >[],
  spansList: Span[],
): Span[] {
  const spanMap = new Map<string, Span>()
  for (const span of spansList) {
    spanMap.set(buildSpanKey(span.id, span.traceId), span)
  }

  return evaluationResults
    .map(({ evaluatedSpanId, evaluatedTraceId }) =>
      spanMap.get(buildSpanKey(evaluatedSpanId!, evaluatedTraceId!)),
    )
    .filter((span): span is Span => span !== undefined)
}

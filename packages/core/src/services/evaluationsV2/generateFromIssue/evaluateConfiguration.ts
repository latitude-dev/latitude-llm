import { calculateMCC } from './calculateMCC'
import { Result } from '@latitude-data/core/lib/Result'

export async function evaluateConfiguration({
  childrenValues,
  spanAndTraceIdPairsOfPositiveEvaluationRuns,
  spanAndTraceIdPairsOfNegativeEvaluationRuns,
}: {
  childrenValues: {
    [jobKey: string]: any // eslint-disable-line @typescript-eslint/no-explicit-any -- this is returned by bullmq
  }
  spanAndTraceIdPairsOfPositiveEvaluationRuns: Array<{
    spanId: string
    traceId: string
  }>
  spanAndTraceIdPairsOfNegativeEvaluationRuns: Array<{
    spanId: string
    traceId: string
  }>
}) {
  const { positiveEvaluationResults, negativeEvaluationResults } =
    sortEvaluationResultsByPositiveAndNegative({
      spanAndTraceIdPairsOfPositiveEvaluationRuns,
      spanAndTraceIdPairsOfNegativeEvaluationRuns,
      evaluationResults: childrenValues,
    })

  const mccResult = await calculateMCC({
    positiveEvaluationResults,
    negativeEvaluationResults,
  })
  if (!Result.isOk(mccResult)) {
    return mccResult
  }
  const mcc = mccResult.unwrap()

  return Result.ok(mcc)
}

function sortEvaluationResultsByPositiveAndNegative({
  spanAndTraceIdPairsOfPositiveEvaluationRuns,
  spanAndTraceIdPairsOfNegativeEvaluationRuns,
  evaluationResults,
}: {
  spanAndTraceIdPairsOfPositiveEvaluationRuns: Array<{
    spanId: string
    traceId: string
  }>
  spanAndTraceIdPairsOfNegativeEvaluationRuns: Array<{
    spanId: string
    traceId: string
  }>
  evaluationResults: {
    [jobKey: string]: any // eslint-disable-line @typescript-eslint/no-explicit-any -- this is returned by bullmq
  }
}) {
  const positiveEvaluationResults: boolean[] = []
  const negativeEvaluationResults: boolean[] = []
  for (const evaluationResult of Object.values(evaluationResults)) {
    const {
      hasPassed,
      evaluatedSpanId: spanId,
      evaluatedTraceId: traceId,
    } = evaluationResult

    if (
      spanAndTraceIdPairsOfPositiveEvaluationRuns.some(
        (pair) => pair.spanId === spanId && pair.traceId === traceId,
      )
    ) {
      positiveEvaluationResults.push(hasPassed)
    } else if (
      spanAndTraceIdPairsOfNegativeEvaluationRuns.some(
        (pair) => pair.spanId === spanId && pair.traceId === traceId,
      )
    ) {
      negativeEvaluationResults.push(hasPassed)
    }
  }
  return {
    positiveEvaluationResults,
    negativeEvaluationResults,
  }
}

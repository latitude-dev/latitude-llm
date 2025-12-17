import { Result } from '@latitude-data/core/lib/Result'
import { Span } from '@latitude-data/constants/tracing'

export function getFalsePositivesAndFalseNegatives({
  spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
  spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
  evaluationResults,
}: {
  spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: Pick<Span, 'id' | 'traceId'>[] // prettier-ignore
  spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: Pick<Span, 'id' | 'traceId'>[] // prettier-ignore
  evaluationResults: {
    [jobKey: string]: any // eslint-disable-line @typescript-eslint/no-explicit-any -- this is returned by bullmq
  }
}) {
  const falsePositives: { spanId: string; traceId: string }[] = []
  const falseNegatives: { spanId: string; traceId: string }[] = []

  for (const evaluationResult of Object.values(evaluationResults)) {
    const {
      hasPassed,
      evaluatedSpanId: spanId,
      evaluatedTraceId: traceId,
    } = evaluationResult

    if (
      spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation.some(
        (pair) => pair.id === spanId && pair.traceId === traceId,
      )
    ) {
      if (!hasPassed) falseNegatives.push({ spanId, traceId })
    } else if (
      spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation.some(
        (pair) => pair.id === spanId && pair.traceId === traceId,
      )
    ) {
      if (hasPassed) falsePositives.push({ spanId, traceId })
    }
  }
  return Result.ok({ falsePositives, falseNegatives }) // prettier-ignore
}

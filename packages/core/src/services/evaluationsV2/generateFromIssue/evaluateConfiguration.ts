import { calculateMCC } from './calculateMCC'
import { Result } from '@latitude-data/core/lib/Result'

/*
  This function evaluates the configuration of an evaluation by calculating the MCC (Matthews Correlation Coefficient) of the evaluation.

  IMPORTANT: 
  - The evaluation MUST fail when the issue is present in the span, as this logic is used within the issue discovery and its how we want our end goal to be.
    We want the evaluations to be like unit tests, where if all of them pass for a given trace of a document, that means that the trace has no issues, that its good!
  - The spans are ONLY from HITL evaluation results, as we want to use the user's annotations to calculate the MCC, not from other evaluations results
*/
export async function evaluateConfiguration({
  childrenValues,
  spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
  spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
}: {
  childrenValues: {
    [jobKey: string]: any // eslint-disable-line @typescript-eslint/no-explicit-any -- this is returned by bullmq
  }
  spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: Array<{
    spanId: string
    traceId: string
  }>
  spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: Array<{
    spanId: string
    traceId: string
  }>
}) {
  const {
    examplesThatShouldPassTheEvaluation,
    examplesThatShouldFailTheEvaluation,
  } = sortEvaluationResultsByShouldPassAndShouldFailTheEvaluation({
    spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
    spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
    evaluationResults: childrenValues,
  })

  const mccResult = calculateMCC({
    examplesThatShouldPassTheEvaluation,
    examplesThatShouldFailTheEvaluation,
  })
  if (!Result.isOk(mccResult)) {
    return mccResult
  }
  const { mcc, confusionMatrix } = mccResult.unwrap()

  return Result.ok({ mcc, confusionMatrix })
}

function sortEvaluationResultsByShouldPassAndShouldFailTheEvaluation({
  spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
  spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
  evaluationResults,
}: {
  spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: Array<{
    spanId: string
    traceId: string
  }>
  spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: Array<{
    spanId: string
    traceId: string
  }>
  evaluationResults: {
    [jobKey: string]: any // eslint-disable-line @typescript-eslint/no-explicit-any -- this is returned by bullmq
  }
}) {
  const examplesThatShouldPassTheEvaluation: boolean[] = []
  const examplesThatShouldFailTheEvaluation: boolean[] = []
  for (const evaluationResult of Object.values(evaluationResults)) {
    const {
      hasPassed,
      evaluatedSpanId: spanId,
      evaluatedTraceId: traceId,
    } = evaluationResult

    if (
      spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation.some(
        (pair) => pair.spanId === spanId && pair.traceId === traceId,
      )
    ) {
      examplesThatShouldPassTheEvaluation.push(hasPassed)
    } else if (
      spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation.some(
        (pair) => pair.spanId === spanId && pair.traceId === traceId,
      )
    ) {
      examplesThatShouldFailTheEvaluation.push(hasPassed)
    }
  }
  return {
    examplesThatShouldPassTheEvaluation,
    examplesThatShouldFailTheEvaluation,
  }
}

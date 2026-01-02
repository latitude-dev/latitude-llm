import { AlignmentMetricMetadata } from '@latitude-data/constants/evaluations'
import { calculateMCC } from './calculateMCC'
import { Result } from '@latitude-data/core/lib/Result'
import { SerializedSpanPair } from '../../../jobs/job-definitions/evaluations/validateGeneratedEvaluationJob'

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
  alreadyCalculatedAlignmentMetricMetadata,
}: {
  childrenValues: {
    [jobKey: string]: any // eslint-disable-line @typescript-eslint/no-explicit-any -- this is returned by bullmq
  }
  spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: SerializedSpanPair[]
  spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: SerializedSpanPair[]
  alreadyCalculatedAlignmentMetricMetadata?: AlignmentMetricMetadata
}) {
  const {
    examplesThatShouldPassTheEvaluation,
    examplesThatShouldFailTheEvaluation,
    processedPositivePairs,
    processedNegativePairs,
  } = sortEvaluationResultsByShouldPassAndShouldFailTheEvaluation({
    spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
    spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
    evaluationResults: childrenValues,
  })

  // Rebalance if there's a mismatch (some child jobs may have failed)
  const {
    balancedPassResults,
    balancedFailResults,
    balancedPositivePairs,
    balancedNegativePairs,
  } = rebalanceResults({
    examplesThatShouldPassTheEvaluation,
    examplesThatShouldFailTheEvaluation,
    processedPositivePairs,
    processedNegativePairs,
  })

  // Calculate the latest cutoff dates from the balanced pairs
  const latestPositiveSpanDate = getLatestDate(balancedPositivePairs)
  const latestNegativeSpanDate = getLatestDate(balancedNegativePairs)

  const mccResult = calculateMCC({
    examplesThatShouldPassTheEvaluation: balancedPassResults,
    examplesThatShouldFailTheEvaluation: balancedFailResults,
    alreadyCalculatedAlignmentMetricMetadata,
  })
  if (!Result.isOk(mccResult)) {
    return mccResult
  }

  const { mcc, confusionMatrix } = mccResult.unwrap()

  return Result.ok({
    mcc,
    confusionMatrix,
    latestPositiveSpanDate,
    latestNegativeSpanDate,
  })
}

function getLatestDate(pairs: SerializedSpanPair[]): Date | undefined {
  if (pairs.length === 0) return undefined
  const latestString = pairs.reduce((latest, pair) => {
    return pair.createdAt > latest ? pair.createdAt : latest
  }, pairs[0]!.createdAt)
  return new Date(latestString)
}

function rebalanceResults({
  examplesThatShouldPassTheEvaluation,
  examplesThatShouldFailTheEvaluation,
  processedPositivePairs,
  processedNegativePairs,
}: {
  examplesThatShouldPassTheEvaluation: boolean[]
  examplesThatShouldFailTheEvaluation: boolean[]
  processedPositivePairs: SerializedSpanPair[]
  processedNegativePairs: SerializedSpanPair[]
}) {
  const targetLength = Math.min(
    examplesThatShouldPassTheEvaluation.length,
    examplesThatShouldFailTheEvaluation.length,
  )

  return {
    balancedPassResults: examplesThatShouldPassTheEvaluation.slice(0, targetLength), // prettier-ignore
    balancedFailResults: examplesThatShouldFailTheEvaluation.slice(0, targetLength), // prettier-ignore
    balancedPositivePairs: processedPositivePairs.slice(0, targetLength), // prettier-ignore
    balancedNegativePairs: processedNegativePairs.slice(0, targetLength), // prettier-ignore
  }
}

function sortEvaluationResultsByShouldPassAndShouldFailTheEvaluation({
  spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
  spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
  evaluationResults,
}: {
  spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: SerializedSpanPair[]
  spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: SerializedSpanPair[]
  evaluationResults: {
    [jobKey: string]: any // eslint-disable-line @typescript-eslint/no-explicit-any -- this is returned by bullmq
  }
}) {
  const examplesThatShouldPassTheEvaluation: boolean[] = []
  const examplesThatShouldFailTheEvaluation: boolean[] = []
  const processedPositivePairs: SerializedSpanPair[] = []
  const processedNegativePairs: SerializedSpanPair[] = []

  for (const evaluationResult of Object.values(evaluationResults)) {
    const {
      hasPassed,
      evaluatedSpanId: spanId,
      evaluatedTraceId: traceId,
    } = evaluationResult

    const positivePair =
      spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation.find(
        (pair) => pair.id === spanId && pair.traceId === traceId,
      )
    if (positivePair) {
      examplesThatShouldPassTheEvaluation.push(hasPassed)
      processedPositivePairs.push(positivePair)
    } else {
      const negativePair =
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation.find(
          (pair) => pair.id === spanId && pair.traceId === traceId,
        )
      if (negativePair) {
        examplesThatShouldFailTheEvaluation.push(hasPassed)
        processedNegativePairs.push(negativePair)
      }
    }
  }
  return {
    examplesThatShouldPassTheEvaluation,
    examplesThatShouldFailTheEvaluation,
    processedPositivePairs,
    processedNegativePairs,
  }
}

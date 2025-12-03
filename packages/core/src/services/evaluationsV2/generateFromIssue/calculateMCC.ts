import { Result } from '@latitude-data/core/lib/Result'

/*
We use the MCC (Matthews Correlation Coefficient) to calculate the quality of the evaluation for a binary classification of the selected issue.
We've decided we need, at least:
- 5 negative annotations for this issue
- 5 positive or other negative annotations for other issues of the same document
Like this, we have enough annotations to calculate the true positive (TP), true negative (TN), false positive (FP) and false negative (FN) to calculate the MCC %.
*/
export function calculateMCC({
  positiveEvaluationResults,
  negativeEvaluationResults,
}: {
  positiveEvaluationResults: boolean[]
  negativeEvaluationResults: boolean[]
}) {
  const truePositives = positiveEvaluationResults.filter((r) => r).length
  const falsePositives = positiveEvaluationResults.filter((r) => !r).length
  const falseNegatives = negativeEvaluationResults.filter((r) => r).length
  const trueNegatives = negativeEvaluationResults.filter((r) => !r).length

  if (
    truePositives + falsePositives === 0 ||
    trueNegatives + falseNegatives === 0
  ) {
    return Result.error(
      new Error('No positive or negative results to calculate MCC'),
    )
  }

  const mcc =
    (truePositives * trueNegatives - falsePositives * falseNegatives) /
    Math.sqrt(
      (truePositives + falsePositives) *
        (truePositives + falseNegatives) *
        (trueNegatives + falsePositives) *
        (trueNegatives + falseNegatives),
    )

  // There can be a case where the denominator is 0 (i.e. all results are false positives or false negatives), so we return 0 instead of NaN
  if (Number.isNaN(mcc)) {
    return Result.ok(0)
  }

  // MCC ranges from -1 to 1, so we scale it to 0-100
  const scaledMccToPercentage = Math.round(50 * (mcc + 1))
  return Result.ok(scaledMccToPercentage)
}

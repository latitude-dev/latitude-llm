import { Result } from '../../../lib/Result'

/*
We use the MCC (Matthews Correlation Coefficient) to calculate the alignment of the evaluation for a binary classification of the selected issue.
We've decided we need, at least:
- 5 negative annotations for this issue
- 5 positive or other negative annotations for other issues of the same document
Like this, we have enough annotations to calculate the true positive (TP), true negative (TN), false positive (FP) and false negative (FN) to calculate the MCC %.
*/
export function calculateMCC({
  examplesThatShouldPassTheEvaluation,
  examplesThatShouldFailTheEvaluation,
}: {
  examplesThatShouldPassTheEvaluation: boolean[]
  examplesThatShouldFailTheEvaluation: boolean[]
}) {
  const truePositives = examplesThatShouldPassTheEvaluation.filter((r) => r).length // prettier-ignore
  const falsePositives = examplesThatShouldPassTheEvaluation.filter((r) => !r).length // prettier-ignore
  const falseNegatives = examplesThatShouldFailTheEvaluation.filter((r) => r).length // prettier-ignore
  const trueNegatives = examplesThatShouldFailTheEvaluation.filter((r) => !r).length // prettier-ignore

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
    return Result.ok({
      mcc: 0,
      confusionMatrix: {
        truePositives,
        trueNegatives,
        falsePositives,
        falseNegatives,
      },
    })
  }

  // MCC ranges from -1 to 1, so we scale it to 0-100
  const scaledMccToPercentage = Math.round(50 * (mcc + 1))
  return Result.ok({
    mcc: scaledMccToPercentage,
    confusionMatrix: {
      truePositives,
      trueNegatives,
      falsePositives,
      falseNegatives,
    },
  })
}

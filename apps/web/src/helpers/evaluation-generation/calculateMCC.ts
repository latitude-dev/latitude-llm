export function calculateMCC({
  confusionMatrix: {
    truePositives = 0,
    trueNegatives = 0,
    falsePositives = 0,
    falseNegatives = 0,
  },
}: {
  confusionMatrix: {
    truePositives: number
    trueNegatives: number
    falsePositives: number
    falseNegatives: number
  }
}) {
  const mcc =
    (truePositives * trueNegatives - falsePositives * falseNegatives) /
    Math.sqrt(
      (truePositives + falsePositives) *
        (truePositives + falseNegatives) *
        (trueNegatives + falsePositives) *
        (trueNegatives + falseNegatives),
    )

  if (Number.isNaN(mcc) || !Number.isFinite(mcc)) {
    return 0
  }

  // MCC ranges from -1 to 1, so we scale it to 0-100
  return Math.round(50 * (mcc + 1))
}

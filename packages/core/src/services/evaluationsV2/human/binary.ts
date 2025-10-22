import { database } from '../../../client'
import {
  EvaluationType,
  HumanEvaluationBinaryResultMetadata,
  HumanEvaluationMetric,
  HumanEvaluationBinarySpecification as specification,
} from '../../../constants'
import { Result } from '../../../lib/Result'
import {
  EvaluationMetricAnnotateArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'

export const HumanEvaluationBinarySpecification = {
  ...specification,
  validate: validate,
  annotate: annotate,
}

async function validate(
  {
    configuration,
  }: EvaluationMetricValidateArgs<
    EvaluationType.Human,
    HumanEvaluationMetric.Binary
  >,
  _ = database,
) {
  configuration.passDescription = configuration.passDescription?.trim()

  configuration.failDescription = configuration.failDescription?.trim()

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
    actualOutput: configuration.actualOutput,
    expectedOutput: configuration.expectedOutput,
    criteria: configuration.criteria,
    passDescription: configuration.passDescription,
    failDescription: configuration.failDescription,
  })
}

function grade({
  score,
  metadata,
}: {
  score: number
  metadata: HumanEvaluationBinaryResultMetadata
}) {
  let normalizedScore = normalizeScore(score, 0, 1)
  let hasPassed = score === 1
  if (metadata.configuration.reverseScale) {
    normalizedScore = normalizeScore(score, 1, 0)
    hasPassed = score === 0
  }

  return { score, normalizedScore, metadata, hasPassed }
}

async function annotate(
  {
    resultScore,
    resultMetadata,
    evaluation,
    actualOutput,
  }: EvaluationMetricAnnotateArgs<
    EvaluationType.Human,
    HumanEvaluationMetric.Binary
  >,
  _ = database,
) {
  const metadata = {
    configuration: evaluation.configuration,
    actualOutput: actualOutput.value ?? '',
    reason: resultMetadata?.reason,
  }

  if (actualOutput.error) {
    metadata.reason = actualOutput.error.message
    return grade({ score: 0, metadata })
  }

  const score = Math.min(Math.max(Number(resultScore.toFixed(0)), 0), 1)

  return grade({ score, metadata })
}

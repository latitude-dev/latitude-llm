import { database } from '../../../client'
import {
  EvaluationType,
  RuleEvaluationExactMatchResultMetadata,
  RuleEvaluationMetric,
  RuleEvaluationExactMatchSpecification as specification,
} from '../../../constants'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'

export const RuleEvaluationExactMatchSpecification = {
  ...specification,
  validate: validate,
  run: run,
}

async function validate(
  {
    configuration,
  }: EvaluationMetricValidateArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >,
  _ = database,
) {
  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
    actualOutput: configuration.actualOutput,
    expectedOutput: configuration.expectedOutput,
    caseInsensitive: configuration.caseInsensitive,
  })
}

function grade({
  score,
  metadata,
}: {
  score: number
  metadata: RuleEvaluationExactMatchResultMetadata
}) {
  let normalizedScore = normalizeScore(score, 0, 1)
  let hasPassed = score === 1
  if (metadata.configuration.reverseScale) {
    normalizedScore = normalizeScore(score, 1, 0)
    hasPassed = score === 0
  }

  return { score, normalizedScore, metadata, hasPassed }
}

async function run(
  {
    evaluation,
    actualOutput,
    expectedOutput,
    datasetLabel,
  }: EvaluationMetricRunArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >,
  _ = database,
) {
  const metadata = {
    configuration: evaluation.configuration,
    actualOutput: actualOutput.value ?? '',
    expectedOutput: expectedOutput?.value,
    datasetLabel: datasetLabel,
  }

  if (actualOutput.error) {
    // TODO(ao): Save reason
    return grade({ score: 0, metadata })
  }

  if (expectedOutput?.error) {
    throw expectedOutput.error
  } else if (!metadata.expectedOutput) {
    throw new BadRequestError('Expected output is required')
  }

  let actualString = metadata.actualOutput
  let expectedString = metadata.expectedOutput
  if (metadata.configuration.caseInsensitive) {
    actualString = metadata.actualOutput.toLowerCase()
    expectedString = metadata.expectedOutput!.toLowerCase()
  }

  const score = actualString === expectedString ? 1 : 0

  return grade({ score, metadata })
}

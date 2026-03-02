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
    customReason,
    datasetLabel,
    datasetReason,
  }: EvaluationMetricRunArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >,
  _ = database,
) {
  const metadata = {
    configuration: evaluation.configuration,
    actualOutput: actualOutput.value ?? '',
    expectedOutput: expectedOutput,
    customReason: customReason,
    datasetLabel: datasetLabel,
    datasetReason: datasetReason,
  } as RuleEvaluationExactMatchResultMetadata

  if (actualOutput.error) {
    metadata.reason = actualOutput.error.message
    return grade({ score: 0, metadata })
  }

  if (metadata.expectedOutput === undefined) {
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

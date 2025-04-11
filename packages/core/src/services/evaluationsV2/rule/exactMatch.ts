import {
  EvaluationType,
  RuleEvaluationExactMatchSpecification,
  RuleEvaluationMetric,
} from '../../../browser'
import { database, Database } from '../../../client'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'
import { BadRequestError } from './../../../lib/errors'
import { Result } from './../../../lib/Result'

const specification = RuleEvaluationExactMatchSpecification
export default {
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
  _: Database = database,
) {
  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
    caseInsensitive: configuration.caseInsensitive,
  })
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
  _: Database = database,
) {
  try {
    let metadata = {
      configuration: evaluation.configuration,
      actualOutput: actualOutput,
      expectedOutput: expectedOutput,
      datasetLabel: datasetLabel,
    }

    if (!metadata.expectedOutput) {
      throw new BadRequestError('Expected output is required')
    }

    if (metadata.configuration.caseInsensitive) {
      metadata.actualOutput = metadata.actualOutput.toLowerCase()
      metadata.expectedOutput = metadata.expectedOutput!.toLowerCase()
    }

    const score = metadata.actualOutput === metadata.expectedOutput ? 1 : 0

    let normalizedScore = normalizeScore(score, 0, 1)
    let hasPassed = score === 1
    if (metadata.configuration.reverseScale) {
      normalizedScore = normalizeScore(score, 1, 0)
      hasPassed = score === 0
    }

    return { score, normalizedScore, metadata, hasPassed }
  } catch (error) {
    return { error: { message: (error as Error).message } }
  }
}

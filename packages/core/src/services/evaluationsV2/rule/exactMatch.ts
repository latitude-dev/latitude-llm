import {
  EvaluationType,
  RuleEvaluationExactMatchSpecification,
  RuleEvaluationMetric,
} from '../../../browser'
import { database, Database } from '../../../client'
import { BadRequestError, Result } from '../../../lib'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'

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
  }: EvaluationMetricRunArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >,
  _: Database = database,
) {
  try {
    let metadata = {}

    if (!expectedOutput) {
      throw new BadRequestError('Expected output is required')
    }

    if (evaluation.configuration.caseInsensitive) {
      actualOutput = actualOutput.toLowerCase()
      expectedOutput = expectedOutput.toLowerCase()
    }

    const score = actualOutput === expectedOutput ? 1 : 0

    let normalizedScore = normalizeScore(score, 0, 1)
    let hasPassed = score === 1
    if (evaluation.configuration.reverseScale) {
      normalizedScore = normalizeScore(score, 1, 0)
      hasPassed = score === 0
    }

    return { score, normalizedScore, metadata, hasPassed }
  } catch (error) {
    return { error: { message: (error as Error).message } }
  }
}

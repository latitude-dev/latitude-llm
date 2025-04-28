import {
  EvaluationType,
  HumanEvaluationMetric,
  HumanEvaluationBinarySpecification as specification,
} from '../../../browser'
import { database, Database } from '../../../client'
import { BadRequestError } from '../../../lib/errors'
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
  _: Database = database,
) {
  if (!configuration.passDescription) {
    return Result.error(new BadRequestError('Pass description is required'))
  }

  if (!configuration.failDescription) {
    return Result.error(new BadRequestError('Fail description is required'))
  }

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
    criteria: configuration.criteria,
    passDescription: configuration.passDescription,
    failDescription: configuration.failDescription,
  })
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
  _: Database = database,
) {
  try {
    let metadata = {
      configuration: evaluation.configuration,
      actualOutput: actualOutput,
      reason: resultMetadata?.reason,
    }

    const score = Math.min(Math.max(Number(resultScore.toFixed(0)), 0), 1)

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

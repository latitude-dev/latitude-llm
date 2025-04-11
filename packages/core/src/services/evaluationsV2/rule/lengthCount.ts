import {
  EvaluationType,
  RuleEvaluationLengthCountSpecification,
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

const specification = RuleEvaluationLengthCountSpecification
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
    RuleEvaluationMetric.LengthCount
  >,
  _: Database = database,
) {
  if (configuration.minLength !== undefined && configuration.minLength < 0) {
    return Result.error(
      new BadRequestError('Minimum length must be a positive number'),
    )
  }

  if (configuration.maxLength !== undefined && configuration.maxLength < 0) {
    return Result.error(
      new BadRequestError('Maximum length must be a positive number'),
    )
  }

  if (
    configuration.minLength !== undefined &&
    configuration.maxLength !== undefined &&
    configuration.minLength >= configuration.maxLength
  ) {
    return Result.error(
      new BadRequestError('Minimum length must be less than maximum length'),
    )
  }

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
    algorithm: configuration.algorithm,
    minLength: configuration.minLength,
    maxLength: configuration.maxLength,
  })
}

async function run(
  {
    evaluation,
    actualOutput,
  }: EvaluationMetricRunArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.LengthCount
  >,
  _: Database = database,
) {
  try {
    let metadata = {
      configuration: evaluation.configuration,
      actualOutput: actualOutput,
    }

    let score = 0

    switch (metadata.configuration.algorithm) {
      case 'character':
        score = metadata.actualOutput.length
        break
      case 'word':
        score = metadata.actualOutput.trim().split(' ').length
        break
      case 'sentence':
        score = metadata.actualOutput.trim().split(/[.!?]/).length
        break
      default:
        throw new Error('Invalid count algorithm')
    }

    const minLength = metadata.configuration.minLength ?? 0
    const maxLength = metadata.configuration.maxLength ?? Infinity

    let normalizedScore = normalizeScore(score, minLength, maxLength)
    if (metadata.configuration.reverseScale) {
      normalizedScore = normalizeScore(score, maxLength, minLength)
    }

    const hasPassed = score >= minLength && score <= maxLength

    return { score, normalizedScore, metadata, hasPassed }
  } catch (error) {
    return { error: { message: (error as Error).message } }
  }
}

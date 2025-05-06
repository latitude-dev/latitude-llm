import {
  EvaluationType,
  HumanEvaluationMetric,
  HumanEvaluationRatingSpecification as specification,
} from '../../../browser'
import { database, Database } from '../../../client'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import {
  EvaluationMetricAnnotateArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'

export const HumanEvaluationRatingSpecification = {
  ...specification,
  validate: validate,
  annotate: annotate,
}

async function validate(
  {
    configuration,
  }: EvaluationMetricValidateArgs<
    EvaluationType.Human,
    HumanEvaluationMetric.Rating
  >,
  _: Database = database,
) {
  if (configuration.minRating >= configuration.maxRating) {
    return Result.error(
      new BadRequestError('Minimum rating must be less than maximum rating'),
    )
  }

  if (
    configuration.minThreshold !== undefined &&
    (configuration.minThreshold < configuration.minRating ||
      configuration.minThreshold > configuration.maxRating)
  ) {
    return Result.error(
      new BadRequestError(
        `Minimum threshold must be a number between ${configuration.minRating} and ${configuration.maxRating}`,
      ),
    )
  }

  if (
    configuration.maxThreshold !== undefined &&
    (configuration.maxThreshold < configuration.minRating ||
      configuration.maxThreshold > configuration.maxRating)
  ) {
    return Result.error(
      new BadRequestError(
        `Maximum threshold must be a number between ${configuration.minRating} and ${configuration.maxRating}`,
      ),
    )
  }

  if (
    configuration.minThreshold !== undefined &&
    configuration.maxThreshold !== undefined &&
    configuration.minThreshold >= configuration.maxThreshold
  ) {
    return Result.error(
      new BadRequestError(
        'Minimum threshold must be less than maximum threshold',
      ),
    )
  }

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
    criteria: configuration.criteria,
    minRating: configuration.minRating,
    minRatingDescription: configuration.minRatingDescription,
    maxRating: configuration.maxRating,
    maxRatingDescription: configuration.maxRatingDescription,
    minThreshold: configuration.minThreshold,
    maxThreshold: configuration.maxThreshold,
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
    HumanEvaluationMetric.Rating
  >,
  _: Database = database,
) {
  let metadata = {
    configuration: evaluation.configuration,
    actualOutput: actualOutput,
    reason: resultMetadata?.reason,
  }

  const score = Math.min(
    Math.max(Number(resultScore.toFixed(0)), metadata.configuration.minRating),
    metadata.configuration.maxRating,
  )

  let normalizedScore = normalizeScore(
    score,
    metadata.configuration.minRating,
    metadata.configuration.maxRating,
  )
  if (metadata.configuration.reverseScale) {
    normalizedScore = normalizeScore(
      score,
      metadata.configuration.maxRating,
      metadata.configuration.minRating,
    )
  }

  const minThreshold =
    metadata.configuration.minThreshold ?? metadata.configuration.minRating
  const maxThreshold =
    metadata.configuration.maxThreshold ?? metadata.configuration.maxRating
  const hasPassed = score >= minThreshold && score <= maxThreshold

  return { score, normalizedScore, metadata, hasPassed }
}

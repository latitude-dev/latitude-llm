import { z } from 'zod'
import { database } from '../../../client'
import {
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationNumericSimilarityResultMetadata,
  RuleEvaluationNumericSimilaritySpecification as specification,
} from '../../../constants'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'

export const RuleEvaluationNumericSimilaritySpecification = {
  ...specification,
  validate: validate,
  run: run,
}

async function validate(
  {
    configuration,
  }: EvaluationMetricValidateArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.NumericSimilarity
  >,
  _ = database,
) {
  if (
    configuration.minSimilarity === undefined &&
    configuration.maxSimilarity === undefined
  ) {
    return Result.error(
      new z.ZodError([
        {
          code: 'custom',
          path: ['similarityThreshold'],
          message:
            'At least one threshold (minimum or maximum similarity) is required',
        },
      ]),
    )
  }

  if (
    configuration.minSimilarity !== undefined &&
    (configuration.minSimilarity < 0 || configuration.minSimilarity > 100)
  ) {
    return Result.error(
      new BadRequestError(
        'Minimum similarity must be a number between 0 and 100',
      ),
    )
  }

  if (
    configuration.maxSimilarity !== undefined &&
    (configuration.maxSimilarity < 0 || configuration.maxSimilarity > 100)
  ) {
    return Result.error(
      new BadRequestError(
        'Maximum similarity must be a number between 0 and 100',
      ),
    )
  }

  if (
    configuration.minSimilarity !== undefined &&
    configuration.maxSimilarity !== undefined &&
    configuration.minSimilarity >= configuration.maxSimilarity
  ) {
    return Result.error(
      new BadRequestError(
        'Minimum similarity must be less than maximum similarity',
      ),
    )
  }

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
    actualOutput: configuration.actualOutput,
    expectedOutput: configuration.expectedOutput,
    algorithm: configuration.algorithm,
    minSimilarity: configuration.minSimilarity,
    maxSimilarity: configuration.maxSimilarity,
  })
}

function grade({
  score,
  metadata,
}: {
  score: number
  metadata: RuleEvaluationNumericSimilarityResultMetadata
}) {
  let normalizedScore = normalizeScore(score, 0, 100)
  if (metadata.configuration.reverseScale) {
    normalizedScore = normalizeScore(score, 100, 0)
  }

  const minSimilarity = metadata.configuration.minSimilarity ?? 0
  const maxSimilarity = metadata.configuration.maxSimilarity ?? 100
  const hasPassed = score >= minSimilarity && score <= maxSimilarity

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
    RuleEvaluationMetric.NumericSimilarity
  >,
  _ = database,
) {
  const metadata = {
    configuration: evaluation.configuration,
    actualOutput: actualOutput.value ?? '',
    expectedOutput: expectedOutput?.value,
    datasetLabel: datasetLabel,
  } as RuleEvaluationNumericSimilarityResultMetadata

  if (actualOutput.error) {
    metadata.reason = actualOutput.error.message
    return grade({ score: 0, metadata })
  }

  if (expectedOutput?.error) {
    throw expectedOutput.error
  } else if (!metadata.expectedOutput) {
    throw new BadRequestError('Expected output is required')
  }

  const actualNumber = Number(metadata.actualOutput)
  if (isNaN(actualNumber)) {
    metadata.reason = 'Invalid numeric actual output'
    return grade({ score: 0, metadata })
  }

  const expectedNumber = Number(metadata.expectedOutput)
  if (isNaN(expectedNumber)) {
    throw new BadRequestError('Invalid numeric expected output')
  }

  let score = 0

  switch (metadata.configuration.algorithm) {
    case 'relative_difference':
      {
        if (actualNumber === expectedNumber) score = 100
        else {
          const relativeDifference =
            Math.abs(expectedNumber - actualNumber) /
            (Math.abs(expectedNumber) + Math.abs(actualNumber))

          score = (1 - relativeDifference) * 100
        }
      }
      break
    default:
      throw new Error('Invalid similarity algorithm')
  }

  score = Math.min(Math.max(Number(score.toFixed(0)), 0), 100)

  return grade({ score, metadata })
}

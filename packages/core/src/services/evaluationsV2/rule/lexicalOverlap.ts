import { distance } from 'fastest-levenshtein'
import * as rouge from 'js-rouge'
import {
  EvaluationType,
  RuleEvaluationLexicalOverlapSpecification,
  RuleEvaluationMetric,
} from '../../../browser'
import { database, Database } from '../../../client'
import { BadRequestError, Result } from '../../../lib'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'

const specification = RuleEvaluationLexicalOverlapSpecification
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
    RuleEvaluationMetric.LexicalOverlap
  >,
  _: Database = database,
) {
  if (
    configuration.minOverlap !== undefined &&
    (configuration.minOverlap < 0 || configuration.minOverlap > 100)
  ) {
    return Result.error(
      new BadRequestError('Minimum overlap must be a number between 0 and 100'),
    )
  }

  if (
    configuration.maxOverlap !== undefined &&
    (configuration.maxOverlap < 0 || configuration.maxOverlap > 100)
  ) {
    return Result.error(
      new BadRequestError('Maximum overlap must be a number between 0 and 100'),
    )
  }

  if (
    configuration.minOverlap !== undefined &&
    configuration.maxOverlap !== undefined &&
    configuration.minOverlap >= configuration.maxOverlap
  ) {
    return Result.error(
      new BadRequestError('Minimum overlap must be less than maximum overlap'),
    )
  }

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
    algorithm: configuration.algorithm,
    minOverlap: configuration.minOverlap,
    maxOverlap: configuration.maxOverlap,
  })
}

async function run(
  {
    evaluation,
    actualOutput,
    expectedOutput,
  }: EvaluationMetricRunArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.LexicalOverlap
  >,
  _: Database = database,
) {
  try {
    let metadata = {
      configuration: evaluation.configuration,
      actualOutput: actualOutput,
      expectedOutput: expectedOutput,
    }

    if (!metadata.expectedOutput) {
      throw new BadRequestError('Expected output is required')
    }

    let score = 0

    switch (metadata.configuration.algorithm) {
      case 'substring':
        {
          let longestMatch = 0
          for (
            let length = metadata.actualOutput.length;
            length > 0;
            length--
          ) {
            const substring = metadata.actualOutput.substring(0, length)
            if (metadata.expectedOutput.includes(substring)) {
              longestMatch = length
              break
            }
          }

          score =
            metadata.expectedOutput.length > 0
              ? (longestMatch / metadata.expectedOutput.length) * 100
              : metadata.actualOutput.length === 0
                ? 100
                : 0
        }
        break
      case 'levenshtein_distance':
        {
          const edits = distance(metadata.actualOutput, metadata.expectedOutput)
          const maxEdits = Math.max(
            metadata.actualOutput.length,
            metadata.expectedOutput.length,
          )

          score = (1 - edits / maxEdits) * 100
        }
        break
      case 'rouge':
        {
          if (
            metadata.actualOutput.trim().split(' ').length < 2 ||
            metadata.expectedOutput.trim().split(' ').length < 2
          ) {
            score =
              rouge.n(metadata.actualOutput, metadata.expectedOutput, {
                n: 1,
              }) * 100
          } else {
            score =
              rouge.n(metadata.actualOutput, metadata.expectedOutput, {
                n: 2,
              }) * 100
          }
        }
        break
      default:
        throw new Error('Invalid overlap algorithm')
    }

    score = Math.min(Math.max(Number(score.toFixed(0)), 0), 100)

    let normalizedScore = normalizeScore(score, 0, 100)
    if (metadata.configuration.reverseScale) {
      normalizedScore = normalizeScore(score, 100, 0)
    }

    const minOverlap = metadata.configuration.minOverlap ?? 0
    const maxOverlap = metadata.configuration.maxOverlap ?? 100
    const hasPassed = score >= minOverlap && score <= maxOverlap

    return { score, normalizedScore, metadata, hasPassed }
  } catch (error) {
    return { error: { message: (error as Error).message } }
  }
}

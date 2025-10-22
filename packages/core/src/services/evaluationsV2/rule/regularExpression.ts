import safeRegex from 'safe-regex'
import { database } from '../../../client'
import {
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationRegularExpressionResultMetadata,
  RuleEvaluationRegularExpressionSpecification as specification,
} from '../../../constants'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'

export const RuleEvaluationRegularExpressionSpecification = {
  ...specification,
  validate: validate,
  run: run,
}

const PATTERN_COMPLEXITY_LIMIT = 25

async function validate(
  {
    configuration,
  }: EvaluationMetricValidateArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.RegularExpression
  >,
  _ = database,
) {
  configuration.pattern = configuration.pattern.trim()
  if (!configuration.pattern) {
    return Result.error(new BadRequestError('Pattern is required'))
  }

  try {
    const regex = new RegExp(configuration.pattern, 'gm')

    if (!safeRegex(regex, { limit: PATTERN_COMPLEXITY_LIMIT })) {
      return Result.error(new BadRequestError('Pattern is too complex'))
    }
  } catch (error) {
    return Result.error(new BadRequestError((error as Error).message))
  }

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
    actualOutput: configuration.actualOutput,
    expectedOutput: configuration.expectedOutput,
    pattern: configuration.pattern,
  })
}

function grade({
  score,
  metadata,
}: {
  score: number
  metadata: RuleEvaluationRegularExpressionResultMetadata
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
  }: EvaluationMetricRunArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.RegularExpression
  >,
  _ = database,
) {
  const metadata = {
    configuration: evaluation.configuration,
    actualOutput: actualOutput.value ?? '',
  } as RuleEvaluationRegularExpressionResultMetadata

  if (actualOutput.error) {
    metadata.reason = actualOutput.error.message
    return grade({ score: 0, metadata })
  }

  const regex = new RegExp(metadata.configuration.pattern, 'gm')

  const matches = metadata.actualOutput.match(regex)

  const score = (matches?.length ?? 0) > 0 ? 1 : 0

  return grade({ score, metadata })
}

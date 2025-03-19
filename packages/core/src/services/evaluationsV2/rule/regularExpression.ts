import safeRegex from 'safe-regex'
import {
  EvaluationType,
  formatMessage,
  RuleEvaluationMetric,
  RuleEvaluationRegularExpressionSpecification,
} from '../../../browser'
import { database, Database } from '../../../client'
import { BadRequestError, Result } from '../../../lib'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'

const specification = RuleEvaluationRegularExpressionSpecification
export default {
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
  _: Database = database,
) {
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
    pattern: configuration.pattern,
  })
}

async function run(
  {
    evaluation,
    conversation,
  }: EvaluationMetricRunArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.RegularExpression
  >,
  _: Database = database,
) {
  try {
    let metadata = {}

    const response = formatMessage(conversation.at(-1)!)
    const regex = new RegExp(evaluation.configuration.pattern, 'gm')

    const matches = response.match(regex)

    const score = (matches?.length ?? 0) > 0 ? 1 : 0
    let normalizedScore = normalizeScore(score, 0, 1)
    if (evaluation.configuration.reverseScale) {
      normalizedScore = normalizeScore(score, 1, 0)
    }

    const hasPassed = score === 1

    return { score, normalizedScore, metadata, hasPassed }
  } catch (error) {
    return { error: { message: (error as Error).message } }
  }
}

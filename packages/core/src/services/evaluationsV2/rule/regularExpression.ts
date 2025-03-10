import safeRegex from 'safe-regex'
import {
  RuleEvaluationRegularExpressionConfiguration,
  RuleEvaluationRegularExpressionSpecification,
} from '../../../browser'
import { database, Database } from '../../../client'
import { BadRequestError, Result } from '../../../lib'

const specification = RuleEvaluationRegularExpressionSpecification
export default {
  ...specification,
  validate: validate,
}

const PATTERN_COMPLEXITY_LIMIT = 25

async function validate(
  {
    configuration,
  }: {
    configuration: RuleEvaluationRegularExpressionConfiguration
  },
  _: Database = database,
) {
  if (!configuration.Pattern) {
    return Result.error(new BadRequestError('Pattern is required'))
  }

  try {
    new RegExp(configuration.Pattern)
  } catch {
    return Result.error(new BadRequestError('Invalid regex pattern'))
  }

  if (!safeRegex(configuration.Pattern, { limit: PATTERN_COMPLEXITY_LIMIT })) {
    return Result.error(new BadRequestError('Invalid regex pattern'))
  }

  return Result.ok(configuration)
}

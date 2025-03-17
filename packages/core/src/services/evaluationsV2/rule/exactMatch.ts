import {
  RuleEvaluationExactMatchConfiguration,
  RuleEvaluationExactMatchSpecification,
} from '../../../browser'
import { database, Database } from '../../../client'
import { BadRequestError, Result } from '../../../lib'

const specification = RuleEvaluationExactMatchSpecification
export default {
  ...specification,
  validate: validate,
}

async function validate(
  {
    configuration,
  }: {
    configuration: RuleEvaluationExactMatchConfiguration
  },
  _: Database = database,
) {
  if (!configuration.datasetLabel) {
    return Result.error(new BadRequestError('Dataset label is required'))
  }

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    datasetLabel: configuration.datasetLabel,
  })
}

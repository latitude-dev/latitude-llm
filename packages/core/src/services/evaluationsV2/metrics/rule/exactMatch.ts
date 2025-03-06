import {
  RuleEvaluationExactMatchConfiguration,
  RuleEvaluationExactMatchSpecification,
} from '../../../../browser'
import { database, Database } from '../../../../client'
import { BadRequestError, Result } from '../../../../lib'

const specification = RuleEvaluationExactMatchSpecification
export default {
  ...specification,
  validate: async (
    {
      configuration,
    }: {
      configuration: RuleEvaluationExactMatchConfiguration
    },
    _: Database = database,
  ) => {
    if (!configuration.DatasetLabel) {
      return Result.error(new BadRequestError('Dataset label is required'))
    }

    return Result.ok(configuration)
  },
}

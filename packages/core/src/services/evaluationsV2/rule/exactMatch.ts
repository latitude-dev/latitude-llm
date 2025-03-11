import {
  EvaluationType,
  formatMessage,
  RuleEvaluationExactMatchSpecification,
  RuleEvaluationMetric,
} from '../../../browser'
import { database, Database } from '../../../client'
import { BadRequestError, Result } from '../../../lib'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'

const specification = RuleEvaluationExactMatchSpecification
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
    RuleEvaluationMetric.ExactMatch
  >,
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

async function run(
  {
    evaluation,
    conversation,
    dataset,
    row,
  }: EvaluationMetricRunArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >,
  _: Database = database,
) {
  try {
    let score = 0
    let metadata = {}

    const response = formatMessage(conversation.at(-1)!)

    if (!dataset || !row) {
      throw new BadRequestError('Dataset row is required')
    }

    const column = dataset.columns.find(
      (c) => c.name === evaluation.configuration.datasetLabel,
    )
    if (!column) {
      throw new BadRequestError(
        `${evaluation.configuration.datasetLabel} column not found in dataset`,
      )
    }

    const expected = row.rowData[column.identifier]?.toString() ?? ''
    score = response === expected ? 1 : 0

    // Note: score is explicitly returned normalized
    return {
      score: normalizeScore(score, 0, 1),
      metadata: metadata,
      error: null,
    }
  } catch (error: unknown) {
    return {
      score: null,
      metadata: null,
      error: {
        message: (error as Error).message,
      },
    }
  }
}

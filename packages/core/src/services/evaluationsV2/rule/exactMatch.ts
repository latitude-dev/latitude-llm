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
  getDatasetColumnData,
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
    reverseScale: configuration.reverseScale,
    caseInsensitive: configuration.caseInsensitive,
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
    let metadata = {}

    if (!dataset || !row) {
      throw new BadRequestError('Dataset row is required')
    }

    let response = formatMessage(conversation.at(-1)!)
    let expected = getDatasetColumnData({
      dataset: dataset,
      row: row,
      column: evaluation.configuration.datasetLabel,
    })
    if (evaluation.configuration.caseInsensitive) {
      response = response.toLowerCase()
      expected = expected.toLowerCase()
    }

    const score = response === expected ? 1 : 0
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

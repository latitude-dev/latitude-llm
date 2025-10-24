import { database } from '../../../client'
import {
  CompositeEvaluationCustomResultMetadata,
  CompositeEvaluationMetric,
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationType,
  CompositeEvaluationCustomSpecification as specification,
} from '../../../constants'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { ResultWithEvaluationV2 } from '../../../schema/types'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'
import { getEvaluationMetricSpecification } from '../specifications'
import { combineScore, validateFormula } from './shared'

export const CompositeEvaluationCustomSpecification = {
  ...specification,
  validate: validate,
  run: run,
}

async function validate(
  {
    configuration,
  }: EvaluationMetricValidateArgs<
    EvaluationType.Composite,
    CompositeEvaluationMetric.Custom
  >,
  _ = database,
) {
  configuration.formula = configuration.formula.trim()
  if (!configuration.formula) {
    return Result.error(new BadRequestError('Formula is required'))
  }

  const validating = validateFormula(
    configuration.formula,
    configuration.evaluationUuids,
  )
  if (validating.error) {
    return Result.error(validating.error)
  }
  configuration.formula = validating.value

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
    actualOutput: configuration.actualOutput,
    expectedOutput: configuration.expectedOutput,
    evaluationUuids: configuration.evaluationUuids,
    formula: configuration.formula,
    minThreshold: configuration.minThreshold,
    maxThreshold: configuration.maxThreshold,
  })
}

function grade({
  score,
  metadata,
}: {
  score: number
  metadata: CompositeEvaluationCustomResultMetadata
}) {
  let normalizedScore = normalizeScore(score, 0, 100)
  if (metadata.configuration.reverseScale) {
    normalizedScore = normalizeScore(score, 100, 0)
  }

  const minThreshold = metadata.configuration.minThreshold ?? 0
  const maxThreshold = metadata.configuration.maxThreshold ?? 100
  const hasPassed = score >= minThreshold && score <= maxThreshold

  return { score, normalizedScore, metadata, hasPassed }
}

function buildResults<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>(results: ResultWithEvaluationV2<T, M>[]) {
  const metadatas: CompositeEvaluationCustomResultMetadata['results'] = {}
  for (const { result, evaluation } of results) {
    if (result.error) {
      throw new BadRequestError(
        `Cannot combine scores from sub-evaluations with errors`,
      )
    }

    const specification = getEvaluationMetricSpecification(evaluation)
    const reason = specification.resultReason(
      result as EvaluationResultSuccessValue<T, M>,
    )

    metadatas[evaluation.uuid] = {
      uuid: result.uuid,
      name: evaluation.name,
      score: result.normalizedScore!,
      reason: reason || 'No reason reported',
    }
  }

  return metadatas
}

async function run(
  {
    evaluation,
    datasetLabel,
    results,
  }: EvaluationMetricRunArgs<
    EvaluationType.Composite,
    CompositeEvaluationMetric.Custom
  >,
  _ = database,
) {
  const metadata = {
    configuration: evaluation.configuration,
    actualOutput: '', // Note: sub-evaluations could have different actual outputs
    expectedOutput: '', // Note: sub-evaluations could have no expected output required
    datasetLabel: datasetLabel,
    results: {},
  } as CompositeEvaluationCustomResultMetadata

  if (!results) {
    throw new BadRequestError('Sub-evaluation results are required')
  }

  metadata.results = buildResults(results)

  let score = combineScore(metadata.configuration.formula, metadata.results)
  score = Math.min(Math.max(Number(score.toFixed(0)), 0), 100)

  return grade({ score, metadata })
}

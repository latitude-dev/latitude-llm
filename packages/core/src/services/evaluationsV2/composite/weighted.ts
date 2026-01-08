import { database } from '../../../client'
import {
  CompositeEvaluationMetric,
  CompositeEvaluationWeightedResultMetadata,
  EvaluationType,
  CompositeEvaluationWeightedSpecification as specification,
} from '../../../constants'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'
import { buildResults, combineScore } from './shared'

export const CompositeEvaluationWeightedSpecification = {
  ...specification,
  validate: validate,
  run: run,
}

async function validate(
  {
    configuration,
    evaluations,
  }: EvaluationMetricValidateArgs<
    EvaluationType.Composite,
    CompositeEvaluationMetric.Weighted
  >,
  _ = database,
) {
  let total = 0
  for (const uuid of configuration.evaluationUuids) {
    const evaluation = evaluations.find((e) => e.uuid === uuid)
    if (!evaluation || evaluation.deletedAt) {
      return Result.error(
        new BadRequestError(`Sub-evaluation ${uuid} not found`),
      )
    }

    if (configuration.weights[uuid] === undefined) {
      return Result.error(
        new BadRequestError(
          `Weight for sub-evaluation ${evaluation.name} is required`,
        ),
      )
    }

    const weight = parseInt(configuration.weights[uuid].toFixed(0))
    if (isNaN(weight) || weight < 0 || weight > 100) {
      return Result.error(
        new BadRequestError(
          `Weight for sub-evaluation ${evaluation.name} must be a number between 0 and 100`,
        ),
      )
    }

    configuration.weights[uuid] = weight
    total += configuration.weights[uuid]
  }
  if (total !== 100) {
    return Result.error(new BadRequestError('Weights must add up to 100%'))
  }

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
    actualOutput: configuration.actualOutput,
    expectedOutput: configuration.expectedOutput,
    evaluationUuids: configuration.evaluationUuids,
    weights: configuration.weights,
    minThreshold: configuration.minThreshold,
    maxThreshold: configuration.maxThreshold,
  })
}

function grade({
  score,
  metadata,
}: {
  score: number
  metadata: CompositeEvaluationWeightedResultMetadata
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

async function run(
  {
    evaluation,
    results,
  }: EvaluationMetricRunArgs<
    EvaluationType.Composite,
    CompositeEvaluationMetric.Weighted
  >,
  _ = database,
) {
  // Note: sub-evaluations could have different actual outputs,
  // and no expected output or dataset label required

  const metadata = {
    configuration: evaluation.configuration,
    actualOutput: '',
    results: {},
  } as CompositeEvaluationWeightedResultMetadata

  if (!results) {
    throw new BadRequestError('Sub-evaluation results are required')
  }

  metadata.results = buildResults(results)

  const numerator = metadata.configuration.evaluationUuids
    .map((e) => `(EVAL('${e}') * ${metadata.configuration.weights[e]})`)
    .join(' + ')
  const denominator = metadata.configuration.evaluationUuids
    .map((e) => metadata.configuration.weights[e])
    .join(' + ')
  const formula = `(${numerator}) / (${denominator})`

  let score = combineScore(formula, metadata.results)
  score = Math.min(Math.max(Number(score.toFixed(0)), 0), 100)

  return grade({ score, metadata })
}

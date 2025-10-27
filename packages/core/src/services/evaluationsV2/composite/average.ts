import { database } from '../../../client'
import {
  CompositeEvaluationAverageResultMetadata,
  CompositeEvaluationMetric,
  EvaluationType,
  CompositeEvaluationAverageSpecification as specification,
} from '../../../constants'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'
import { buildResults, combineScore } from './shared'

export const CompositeEvaluationAverageSpecification = {
  ...specification,
  validate: validate,
  run: run,
}

async function validate(
  {
    configuration,
  }: EvaluationMetricValidateArgs<
    EvaluationType.Composite,
    CompositeEvaluationMetric.Average
  >,
  _ = database,
) {
  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
    actualOutput: configuration.actualOutput,
    expectedOutput: configuration.expectedOutput,
    evaluationUuids: configuration.evaluationUuids,
    minThreshold: configuration.minThreshold,
    maxThreshold: configuration.maxThreshold,
  })
}

function grade({
  score,
  metadata,
}: {
  score: number
  metadata: CompositeEvaluationAverageResultMetadata
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
    CompositeEvaluationMetric.Average
  >,
  _ = database,
) {
  // Note: sub-evaluations could have different actual outputs,
  // and no expected output or dataset label required

  const metadata = {
    configuration: evaluation.configuration,
    actualOutput: '',
    results: {},
  } as CompositeEvaluationAverageResultMetadata

  if (!results) {
    throw new BadRequestError('Sub-evaluation results are required')
  }

  metadata.results = buildResults(results)

  const numerator = metadata.configuration.evaluationUuids
    .map((e) => `EVAL('${e}')`)
    .join(' + ')
  const formula = `(${numerator}) / RESULTS()`

  let score = combineScore(formula, metadata.results)
  score = Math.min(Math.max(Number(score.toFixed(0)), 0), 100)

  return grade({ score, metadata })
}

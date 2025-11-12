import { database } from '../../../client'
import {
  CompositeEvaluationMetric,
  CompositeEvaluationResultError,
  CompositeEvaluationResultMetadata,
  EvaluationResultValue,
  EvaluationType,
  EvaluationV2,
  CompositeEvaluationSpecification as specification,
} from '../../../constants'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { EvaluationsV2Repository } from '../../../repositories'
import { runEvaluationV2 } from '../run'
import {
  EvaluationMetricBackendSpecification,
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'
import { getEvaluationMetricSpecification } from '../specifications'
import { CompositeEvaluationAverageSpecification } from './average'
import { CompositeEvaluationCustomSpecification } from './custom'
import { CompositeEvaluationWeightedSpecification } from './weighted'

// prettier-ignore
const METRICS: {
  [M in CompositeEvaluationMetric]: EvaluationMetricBackendSpecification<EvaluationType.Composite, M>
} = {
  [CompositeEvaluationMetric.Average]: CompositeEvaluationAverageSpecification,
  [CompositeEvaluationMetric.Weighted]: CompositeEvaluationWeightedSpecification,
  [CompositeEvaluationMetric.Custom]: CompositeEvaluationCustomSpecification,
}

export const CompositeEvaluationSpecification = {
  ...specification,
  validate: validate,
  run: run,
  metrics: METRICS,
}

async function validate<M extends CompositeEvaluationMetric>(
  {
    metric,
    uuid,
    configuration,
    evaluations,
    ...rest
  }: EvaluationMetricValidateArgs<EvaluationType.Composite, M> & {
    metric: M
  },
  db = database,
) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) {
    return Result.error(new BadRequestError('Invalid metric'))
  }

  const parsing = metricSpecification.configuration.safeParse(configuration)
  if (parsing.error) {
    return Result.error(parsing.error)
  }

  if (configuration.evaluationUuids?.length === 0) {
    return Result.error(new BadRequestError('Sub-evaluations are required'))
  }

  for (const subUuid of configuration.evaluationUuids) {
    if (subUuid === uuid) {
      return Result.error(
        new BadRequestError(
          'Cannot use the current evaluation as a sub-evaluation',
        ),
      )
    }

    const evaluation = evaluations.find((e) => e.uuid === subUuid)
    if (!evaluation || evaluation.deletedAt) {
      return Result.error(
        new BadRequestError(`Sub-evaluation ${subUuid} not found`),
      )
    }

    // Note: to simplify things, only batch evaluation mode is supported
    const specification = getEvaluationMetricSpecification(evaluation)
    if (!specification.supportsBatchEvaluation) {
      return Result.error(
        new BadRequestError(
          `Sub-evaluation ${evaluation.name} does not support batch evaluation`,
        ),
      )
    }

    // Note: to simplify things, currently sub-evaluations cannot require an expected output
    if (specification.requiresExpectedOutput) {
      return Result.error(
        new BadRequestError(
          `Sub-evaluation ${evaluation.name} requires an expected output`,
        ),
      )
    }

    if (
      evaluation.type === EvaluationType.Composite &&
      (
        evaluation as EvaluationV2<EvaluationType.Composite>
      ).configuration.evaluationUuids.includes(uuid ?? '')
    ) {
      return Result.error(
        new BadRequestError(
          `Cannot use ${evaluation.name}, which includes the current evaluation, as a sub-evaluation`,
        ),
      )
    }
  }

  if (
    configuration.minThreshold !== undefined &&
    (configuration.minThreshold < 0 || configuration.minThreshold > 100)
  ) {
    return Result.error(
      new BadRequestError(
        'Minimum threshold must be a number between 0 and 100',
      ),
    )
  }

  if (
    configuration.maxThreshold !== undefined &&
    (configuration.maxThreshold < 0 || configuration.maxThreshold > 100)
  ) {
    return Result.error(
      new BadRequestError(
        'Maximum threshold must be a number between 0 and 100',
      ),
    )
  }

  if (
    configuration.minThreshold !== undefined &&
    configuration.maxThreshold !== undefined &&
    configuration.minThreshold >= configuration.maxThreshold
  ) {
    return Result.error(
      new BadRequestError(
        'Minimum threshold must be less than maximum threshold',
      ),
    )
  }

  const validation = await metricSpecification.validate(
    { uuid, configuration, evaluations, ...rest },
    db,
  )
  if (validation.error) {
    return Result.error(validation.error)
  }
  configuration = validation.value

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    ...configuration,
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
  metadata: CompositeEvaluationResultMetadata
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

async function run<M extends CompositeEvaluationMetric>(
  {
    metric,
    evaluation,
    span,
    document,
    experiment,
    dataset,
    datasetLabel,
    datasetRow,
    commit,
    workspace,
    ...rest
  }: EvaluationMetricRunArgs<EvaluationType.Composite, M> & {
    metric: M
  },
  db = database,
) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) {
    throw new BadRequestError('Invalid evaluation metric')
  }

  if (!metricSpecification.run) {
    throw new BadRequestError('Running is not supported for this evaluation')
  }

  const repository = new EvaluationsV2Repository(workspace.id, db)
  let evaluations = await repository
    .listAtCommitByDocument({
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
    })
    .then((r) => r.unwrap())

  evaluations = evaluations.filter(
    (e) =>
      !e.deletedAt &&
      e.uuid !== evaluation.uuid &&
      evaluation.configuration.evaluationUuids.includes(e.uuid),
  )
  if (evaluations.length !== evaluation.configuration.evaluationUuids.length) {
    throw new BadRequestError('Some sub-evaluations were not found')
  }

  const results = await Promise.all(
    evaluations.map(async (evaluation) => {
      const { result } = await runEvaluationV2({
        evaluation: evaluation,
        span,
        experiment: experiment,
        dataset: dataset,
        datasetLabel: datasetLabel,
        datasetRow: datasetRow,
        commit: commit,
        workspace: workspace,
        dry: true, // Note: we don't want to persist results for the sub-evaluations
      }).then((r) => r.unwrap())
      return { result, evaluation }
    }),
  )

  const errors: CompositeEvaluationResultError['errors'] = {}
  for (const { result, evaluation } of results) {
    if (!result.error) continue

    errors[evaluation.uuid] = {
      uuid: result.uuid,
      name: evaluation.name,
      message: result.error.message,
    }
  }

  if (Object.keys(errors).length > 0) {
    let message = ''

    const messages = Object.entries(errors).map(
      ([_, error]) => `${error.name}: ${error.message}`,
    )

    message = messages.join('\n\n')

    return {
      error: { message, errors },
    } as EvaluationResultValue<EvaluationType.Composite, M>
  }

  const value = await metricSpecification.run(
    {
      evaluation: evaluation,
      span,
      document: document,
      experiment: experiment,
      dataset: dataset,
      datasetLabel: datasetLabel,
      datasetRow: datasetRow,
      results: results,
      commit: commit,
      workspace: workspace,
      ...rest,
    },
    db,
  )
  if (value.error) {
    return value
  }

  const metadata = value.metadata!
  const score = Math.min(Math.max(Number(value.score!.toFixed(0)), 0), 100)

  return {
    ...grade({ score, metadata }),
  } as EvaluationResultValue<EvaluationType.Composite, M>
}

import {
  ErrorableEntity,
  EvaluationResultValue,
  EvaluationType,
  LlmEvaluationMetric,
  LlmEvaluationSpecification as specification,
} from '../../../browser'
import { database, Database } from '../../../client'
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { ProviderApiKeysRepository } from '../../../repositories'
import { buildProvidersMap } from '../../providerApiKeys/buildMap'
import { createRunError } from '../../runErrors/create'
import { isErrorRetryable } from '../run'
import {
  EvaluationMetricBackendSpecification,
  EvaluationMetricCloneArgs,
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
} from '../shared'
import { LlmEvaluationBinarySpecification } from './binary'
import { LlmEvaluationComparisonSpecification } from './comparison'
import { LlmEvaluationCustomSpecification } from './custom'
import { LlmEvaluationCustomLabeledSpecification } from './customLabeled'
import { LlmEvaluationRatingSpecification } from './rating'

// prettier-ignore
const METRICS: {
  [M in LlmEvaluationMetric]: EvaluationMetricBackendSpecification<EvaluationType.Llm, M>
} = {
  [LlmEvaluationMetric.Binary]: LlmEvaluationBinarySpecification,
  [LlmEvaluationMetric.Rating]: LlmEvaluationRatingSpecification,
  [LlmEvaluationMetric.Comparison]: LlmEvaluationComparisonSpecification,
  [LlmEvaluationMetric.Custom]: LlmEvaluationCustomSpecification,
  [LlmEvaluationMetric.CustomLabeled]: LlmEvaluationCustomLabeledSpecification,
}

export const LlmEvaluationSpecification = {
  ...specification,
  validate: validate,
  run: run,
  clone: clone,
  metrics: METRICS,
}

async function validate<M extends LlmEvaluationMetric>(
  {
    mode,
    metric,
    configuration,
    workspace,
    ...rest
  }: EvaluationMetricValidateArgs<EvaluationType.Llm, M> & {
    metric: M
  },
  db: Database = database,
) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) {
    return Result.error(new BadRequestError('Invalid metric'))
  }

  metricSpecification.configuration.parse(configuration)

  if (!metric.startsWith(LlmEvaluationMetric.Custom) || mode !== 'update') {
    if (!configuration.provider) {
      return Result.error(new BadRequestError('Provider is required'))
    }

    const providersRepository = new ProviderApiKeysRepository(workspace.id, db)
    await providersRepository
      .findByName(configuration.provider)
      .then((r) => r.unwrap())

    if (!configuration.model) {
      return Result.error(new BadRequestError('Model is required'))
    }
  }

  configuration = await metricSpecification
    .validate({ mode, configuration, workspace, ...rest }, db)
    .then((r) => r.unwrap())

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    ...configuration,
    reverseScale: configuration.reverseScale,
    provider: configuration.provider,
    model: configuration.model,
  })
}

async function run<M extends LlmEvaluationMetric>(
  {
    metric,
    resultUuid,
    workspace,
    ...rest
  }: EvaluationMetricRunArgs<EvaluationType.Llm, M> & {
    metric: M
  },
  db: Database = database,
) {
  try {
    const metricSpecification = METRICS[metric]
    if (!metricSpecification) {
      throw new BadRequestError('Invalid evaluation metric')
    }

    if (!metricSpecification.run) {
      throw new BadRequestError('Running is not supported for this evaluation')
    }

    const providers = await buildProvidersMap({ workspaceId: workspace.id })

    const value = await metricSpecification.run(
      { resultUuid, providers, workspace, ...rest },
      db,
    )

    return value
  } catch (error) {
    if (isErrorRetryable(error as Error)) throw error

    let runError
    if (error instanceof ChainError) {
      runError = await createRunError(
        {
          data: {
            errorableUuid: resultUuid,
            errorableType: ErrorableEntity.EvaluationResult,
            code: error.errorCode,
            message: error.message,
            details: error.details,
          },
        },
        db,
      ).then((r) => r.unwrap())
    }

    return {
      error: { message: (error as Error).message, runErrorId: runError?.id },
    } as EvaluationResultValue<EvaluationType.Llm, M>
  }
}

async function clone<M extends LlmEvaluationMetric>(
  {
    metric,
    workspace,
    ...rest
  }: EvaluationMetricCloneArgs<EvaluationType.Llm, M> & {
    metric: M
  },
  db: Database = database,
) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) {
    return Result.error(new BadRequestError('Invalid evaluation metric'))
  }

  if (!metricSpecification.clone) {
    return Result.error(
      new BadRequestError('Cloning is not supported for this evaluation'),
    )
  }

  const providers = await buildProvidersMap({ workspaceId: workspace.id })

  const settings = await metricSpecification
    .clone({ providers, workspace, ...rest }, db)
    .then((r) => r.unwrap())

  return Result.ok(settings)
}

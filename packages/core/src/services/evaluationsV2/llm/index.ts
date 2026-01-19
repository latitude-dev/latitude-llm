import { ChainError } from '@latitude-data/constants/errors'
import { database } from '../../../client'
import {
  ErrorableEntity,
  EvaluationResultValue,
  EvaluationType,
  LlmEvaluationMetric,
  LlmEvaluationSpecification as specification,
} from '../../../constants'
import { BadRequestError } from '../../../lib/errors'
import { isRetryableError } from '../../../lib/isRetryableError'
import { Result } from '../../../lib/Result'
import { ProviderApiKeysRepository } from '../../../repositories'
import { buildProvidersMap } from '../../providerApiKeys/buildMap'
import { createRunError } from '../../runErrors/create'
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

  if (!metric.startsWith(LlmEvaluationMetric.Custom) || mode !== 'update') {
    configuration.provider = configuration.provider.trim()
    if (!configuration.provider) {
      return Result.error(new BadRequestError('Provider is required'))
    }

    const repository = new ProviderApiKeysRepository(workspace.id, db)
    const getting = await repository.findByName(configuration.provider)
    if (getting.error) {
      return Result.error(getting.error)
    }

    configuration.model = configuration.model.trim()
    if (!configuration.model) {
      return Result.error(new BadRequestError('Model is required'))
    }
  }

  const validation = await metricSpecification.validate(
    { mode, configuration, workspace, ...rest },
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
  db = database,
) {
  try {
    const metricSpecification = METRICS[metric]
    if (!metricSpecification) {
      throw new BadRequestError('Invalid evaluation metric')
    }

    if (!metricSpecification.run) {
      throw new BadRequestError('Running is not supported for this evaluation')
    }

    const providers = await buildProvidersMap({ workspaceId: workspace.id }, db)
    const value = await metricSpecification.run(
      {
        resultUuid,
        providers,
        workspace,
        ...rest,
      },
      db,
    )

    return value
  } catch (error) {
    if (isRetryableError(error as Error)) throw error

    let runError
    if (error instanceof ChainError) {
      runError = await createRunError({
        data: {
          errorableUuid: resultUuid,
          errorableType: ErrorableEntity.EvaluationResult,
          code: error.errorCode,
          message: error.message,
          details: error.details,
        },
      }).then((r) => r.unwrap())
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
  db = database,
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

  const providers = await buildProvidersMap({ workspaceId: workspace.id }, db)

  const settings = await metricSpecification
    .clone({ providers, workspace, ...rest }, db)
    .then((r) => r.unwrap())

  return Result.ok(settings)
}

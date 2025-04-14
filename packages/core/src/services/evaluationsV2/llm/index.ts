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
import {
  EvaluationMetricBackendSpecification,
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
} from '../shared'
import { LlmEvaluationBinarySpecification } from './binary'

// prettier-ignore
const METRICS: {
  [M in LlmEvaluationMetric]: EvaluationMetricBackendSpecification<EvaluationType.Llm, M>
} = {
  [LlmEvaluationMetric.Binary]: LlmEvaluationBinarySpecification,
  [LlmEvaluationMetric.Rating]: undefined as any, // TODO(evalsv2): Implement
  [LlmEvaluationMetric.Comparison]: undefined as any, // TODO(evalsv2): Implement
  [LlmEvaluationMetric.Custom]: undefined as any, // TODO(evalsv2): Implement
}

export const LlmEvaluationSpecification = {
  ...specification,
  validate: validate,
  run: run,
  metrics: METRICS,
}

async function validate<M extends LlmEvaluationMetric>(
  {
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

  configuration = await metricSpecification
    .validate({ configuration, workspace, ...rest }, db)
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

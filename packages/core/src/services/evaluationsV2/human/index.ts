import {
  EvaluationType,
  HumanEvaluationMetric,
  HumanEvaluationSpecification as specification,
} from '../../../browser'
import { database, Database } from '../../../client'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import {
  EvaluationMetricAnnotateArgs,
  EvaluationMetricBackendSpecification,
  EvaluationMetricValidateArgs,
} from '../shared'
import { HumanEvaluationBinarySpecification } from './binary'
import { HumanEvaluationRatingSpecification } from './rating'

// prettier-ignore
const METRICS: {
  [M in HumanEvaluationMetric]: EvaluationMetricBackendSpecification<EvaluationType.Human, M>
} = {
  [HumanEvaluationMetric.Binary]: HumanEvaluationBinarySpecification,
  [HumanEvaluationMetric.Rating]: HumanEvaluationRatingSpecification,
}

export const HumanEvaluationSpecification = {
  ...specification,
  validate: validate,
  annotate: annotate,
  metrics: METRICS,
}

async function validate<M extends HumanEvaluationMetric>(
  {
    metric,
    configuration,
    ...rest
  }: EvaluationMetricValidateArgs<EvaluationType.Human, M> & {
    metric: M
  },
  db: Database = database,
) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) {
    return Result.error(new BadRequestError('Invalid metric'))
  }

  const parsing = metricSpecification.configuration.safeParse(configuration)
  if (parsing.error) {
    return Result.error(parsing.error)
  }

  configuration.criteria = configuration.criteria?.trim()

  const validation = await metricSpecification.validate(
    { configuration, ...rest },
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
    criteria: configuration.criteria,
  })
}

async function annotate<M extends HumanEvaluationMetric>(
  {
    metric,
    resultMetadata,
    ...rest
  }: EvaluationMetricAnnotateArgs<EvaluationType.Human, M> & {
    metric: M
  },
  db: Database = database,
) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) {
    throw new BadRequestError('Invalid evaluation metric')
  }

  if (!metricSpecification.annotate) {
    throw new BadRequestError('Annotating is not supported for this evaluation')
  }

  if (resultMetadata) {
    metricSpecification.resultMetadata.partial().parse(resultMetadata)
  }

  const value = await metricSpecification.annotate(
    { resultMetadata, ...rest },
    db,
  )

  return value
}

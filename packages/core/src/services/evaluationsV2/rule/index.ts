import {
  EvaluationResultValue,
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationSpecification,
} from '../../../browser'
import { database, Database } from '../../../client'
import { BadRequestError, Result } from '../../../lib'
import {
  EvaluationMetricBackendSpecification,
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
} from '../shared'
import RuleEvaluationExactMatchSpecification from './exactMatch'
import RuleEvaluationRegularExpressionSpecification from './regularExpression'

// prettier-ignore
const METRICS: {
  [M in RuleEvaluationMetric]: EvaluationMetricBackendSpecification<EvaluationType.Rule, M>
} = {
  [RuleEvaluationMetric.ExactMatch]: RuleEvaluationExactMatchSpecification,
  [RuleEvaluationMetric.RegularExpression]: RuleEvaluationRegularExpressionSpecification,
  [RuleEvaluationMetric.LengthCount]:  undefined as any, // TODO: Implement
  [RuleEvaluationMetric.LexicalOverlap]:  undefined as any, // TODO: Implement
  [RuleEvaluationMetric.SemanticSimilarity]:  undefined as any, // TODO: Implement
}

const specification = RuleEvaluationSpecification
export default {
  ...specification,
  validate: validate,
  run: run,
  metrics: METRICS,
}

async function validate<M extends RuleEvaluationMetric>(
  {
    metric,
    configuration,
  }: EvaluationMetricValidateArgs<EvaluationType.Rule, M> & {
    metric: M
  },
  db: Database = database,
) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) {
    return Result.error(new BadRequestError('Invalid metric'))
  }

  metricSpecification.configuration.parse(configuration)

  configuration = await metricSpecification
    .validate({ configuration }, db)
    .then((r) => r.unwrap())

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    ...configuration,
    reverseScale: configuration.reverseScale,
  })
}

async function run<M extends RuleEvaluationMetric>(
  {
    metric,
    ...rest
  }: EvaluationMetricRunArgs<EvaluationType.Rule, M> & {
    metric: M
  },
  db: Database = database,
) {
  try {
    const metricSpecification = METRICS[metric]
    if (!metricSpecification) {
      throw new BadRequestError('Invalid evaluation metric')
    }

    const value = await metricSpecification.run({ ...rest }, db)

    return value
  } catch (error) {
    return {
      error: { message: (error as Error).message },
    } as EvaluationResultValue<EvaluationType.Rule, M>
  }
}

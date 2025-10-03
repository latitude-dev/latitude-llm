import { database } from '../../../client'
import {
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationSpecification as specification,
} from '../../../constants'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import {
  EvaluationMetricBackendSpecification,
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
} from '../shared'
import { RuleEvaluationExactMatchSpecification } from './exactMatch'
import { RuleEvaluationLengthCountSpecification } from './lengthCount'
import { RuleEvaluationLexicalOverlapSpecification } from './lexicalOverlap'
import { RuleEvaluationNumericSimilaritySpecification } from './numericSimilarity'
import { RuleEvaluationRegularExpressionSpecification } from './regularExpression'
import { RuleEvaluationSchemaValidationSpecification } from './schemaValidation'
import { RuleEvaluationSemanticSimilaritySpecification } from './semanticSimilarity'

// prettier-ignore
const METRICS: {
  [M in RuleEvaluationMetric]: EvaluationMetricBackendSpecification<EvaluationType.Rule, M>
} = {
  [RuleEvaluationMetric.ExactMatch]: RuleEvaluationExactMatchSpecification,
  [RuleEvaluationMetric.RegularExpression]: RuleEvaluationRegularExpressionSpecification,
  [RuleEvaluationMetric.SchemaValidation]: RuleEvaluationSchemaValidationSpecification,
  [RuleEvaluationMetric.LengthCount]: RuleEvaluationLengthCountSpecification,
  [RuleEvaluationMetric.LexicalOverlap]: RuleEvaluationLexicalOverlapSpecification,
  [RuleEvaluationMetric.SemanticSimilarity]: RuleEvaluationSemanticSimilaritySpecification,
  [RuleEvaluationMetric.NumericSimilarity]: RuleEvaluationNumericSimilaritySpecification,
}

export const RuleEvaluationSpecification = {
  ...specification,
  validate: validate,
  run: run,
  metrics: METRICS,
}

async function validate<M extends RuleEvaluationMetric>(
  {
    metric,
    configuration,
    ...rest
  }: EvaluationMetricValidateArgs<EvaluationType.Rule, M> & {
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
  })
}

async function run<M extends RuleEvaluationMetric>(
  {
    metric,
    ...rest
  }: EvaluationMetricRunArgs<EvaluationType.Rule, M> & {
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

  const value = await metricSpecification.run({ ...rest }, db)

  return value
}

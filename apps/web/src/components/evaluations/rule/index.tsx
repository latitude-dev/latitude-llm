import {
  EvaluationType,
  RuleEvaluationConfiguration,
  RuleEvaluationMetric,
  RuleEvaluationSpecification,
} from '@latitude-data/constants'
import { EvaluationMetricFrontendSpecification } from '../index'
import RuleEvaluationExactMatchSpecification from './ExactMatch'
import RuleEvaluationRegularExpressionSpecification from './RegularExpression'

// prettier-ignore
const METRICS: {
  [M in RuleEvaluationMetric]: EvaluationMetricFrontendSpecification<EvaluationType.Rule, M>
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
  ConfigurationForm: ConfigurationForm,
  metrics: METRICS,
}

function ConfigurationForm<M extends RuleEvaluationMetric>({
  metric,
  configuration,
  onChange,
}: {
  metric: M
  configuration: RuleEvaluationConfiguration<M>
  onChange: (configuration: RuleEvaluationConfiguration<M>) => void
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  // TODO: Implement (probably dont pass the metric and make a selector component)
  return (
    <div>
      <h1>Rule Evaluation</h1>
      <metricSpecification.ConfigurationForm
        configuration={configuration}
        onChange={onChange}
      />
    </div>
  )
}

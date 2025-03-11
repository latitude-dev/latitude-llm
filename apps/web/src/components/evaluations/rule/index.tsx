import {
  EvaluationType,
  RuleEvaluationConfiguration,
  RuleEvaluationMetric,
  RuleEvaluationSpecification,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui'
import { useEffect, useState } from 'react'
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
  icon: 'computer' as IconName,
  ConfigurationForm: ConfigurationForm,
  metrics: METRICS,
}

function ConfigurationForm<M extends RuleEvaluationMetric>({
  mode,
  metric,
  configuration: defaultConfiguration,
  onChange,
}: {
  mode: 'create' | 'update'
  metric: M
  configuration?: RuleEvaluationConfiguration<M>
  onChange?: (configuration: RuleEvaluationConfiguration<M>) => void
}) {
  const [configuration, setConfiguration] = useState<
    RuleEvaluationConfiguration<M>
  >(defaultConfiguration ?? ({} as RuleEvaluationConfiguration<M>))
  useEffect(() => onChange?.(configuration), [configuration])

  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <metricSpecification.ConfigurationForm
        mode={mode}
        configuration={configuration}
        onChange={(value) => setConfiguration({ ...configuration, ...value })}
      />
    </>
  )
}

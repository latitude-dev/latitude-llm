import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { EVALUATION_SPECIFICATIONS } from '$/components/evaluations'
import { EvaluationMetric, EvaluationType } from '@latitude-data/constants'

export function EvaluationStats<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>() {
  const { evaluation } = useCurrentEvaluationV2<T, M>()

  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  const metricSpecification = typeSpecification.metrics[evaluation.metric]

  // TODO
  metricSpecification

  return <h1>Evaluation Stats</h1>
}

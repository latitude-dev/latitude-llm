import {
  EvaluationV2,
  EvaluationType,
  LlmEvaluationMetric,
} from '../../constants'
import { hashContent } from '../../lib/hashContent'

export function generateConfigurationHash(
  evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>,
) {
  const { provider, model, criteria, passDescription, failDescription } =
    evaluation.configuration
  return hashContent(
    JSON.stringify({
      provider,
      model,
      criteria,
      passDescription,
      failDescription,
    }),
  )
}

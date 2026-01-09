import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
} from '../../constants'
import { hashObject } from '../../lib/hashObject'

export function generateConfigurationHash(
  evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>,
) {
  const { provider, model, criteria, passDescription, failDescription } =
    evaluation.configuration
  return hashObject({
    provider,
    model,
    criteria,
    passDescription,
    failDescription,
  }).hash
}

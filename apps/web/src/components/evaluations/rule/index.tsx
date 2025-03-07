import {
  RuleEvaluationMetric,
  RuleEvaluationSpecification,
} from '@latitude-data/constants'
import RuleEvaluationExactMatchSpecification from './ExactMatch'
import RuleEvaluationRegularExpressionSpecification from './RegularExpression'

const specification = RuleEvaluationSpecification
export default {
  ...specification,
  // prettier-ignore
  metrics: {
    [RuleEvaluationMetric.ExactMatch]: RuleEvaluationExactMatchSpecification,
    [RuleEvaluationMetric.RegularExpression]: RuleEvaluationRegularExpressionSpecification,
    [RuleEvaluationMetric.LengthCount]: undefined as any, // TODO: Implement
    [RuleEvaluationMetric.LexicalOverlap]: undefined as any, // TODO: Implement
    [RuleEvaluationMetric.SemanticSimilarity]: undefined as any, // TODO: Implement
  },
}

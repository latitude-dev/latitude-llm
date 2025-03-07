import {
  RuleEvaluationMetric,
  RuleEvaluationSpecification,
} from '../../../browser'
import RuleEvaluationExactMatchSpecification from './exactMatch'
import RuleEvaluationRegularExpressionSpecification from './regularExpression'

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

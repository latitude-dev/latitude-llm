export const MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE = 5
export const MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES = 5
export const MINIMUM_MONTLY_ANNOTATIONS = 10
export const OPTIMAL_MONTLY_ANNOTATIONS = 100

export const MIN_ALIGNMENT_METRIC_THRESHOLD = 70

export const MAX_ATTEMPTS_TO_GENERATE_EVALUATION_FROM_ISSUE = 3

export const EVALUATION_ALIGNMENT_EXPLANATION =
  'When an evaluation is linked to an issue, we use the Matthews Correlation Coefficient (MCC) to calculate how well the evaluation is aligned with your judgement.'

export const EVALUATION_ALIGNMENT_MIN_ANNOTATIONS = 4
export const EVALUATION_ALIGNMENT_MAX_ANNOTATIONS = 100
export const EVALUATION_ALIGNMENT_VALSET_SPLIT = 0.7 // 70% trainset, 30% valset
export const EVALUATION_ALIGNMENT_DATASET_CONVO = 'conversation'
export const EVALUATION_ALIGNMENT_DATASET_LABEL = 'verdict'
export const EVALUATION_ALIGNMENT_DATASET_REASON = 'reason'
export const EVALUATION_ALIGNMENT_BUDGET_TIME = 15 * 60 // 15 minutes
export const EVALUATION_ALIGNMENT_BUDGET_TOKENS = 10_000_000 // 10M tokens

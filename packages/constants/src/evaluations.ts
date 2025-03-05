type BaseEvaluationConfiguration = {}
type BaseEvaluationResultMetadata = {}

export enum EvaluationType {
  Rule = 'rule',
  Llm = 'llm',
  Human = 'human',
}

/* RULE EVALUATIONS */

export type RuleEvaluationConfiguration = BaseEvaluationConfiguration & {}
export type RuleEvaluationResultMetadata = BaseEvaluationResultMetadata & {}

export enum RuleEvaluationMetric {
  ExactMatch = 'exact_match',
  RegularExpression = 'regular_expression',
  LengthCount = 'length_count',
  LexicalOverlap = 'lexical_overlap',
  SemanticSimilarity = 'semantic_similarity',
}

// EXACT MATCH

export type RuleEvaluationExactMatchConfiguration =
  RuleEvaluationConfiguration & {
    DatasetLabel: string
  }
export type RuleEvaluationExactMatchResultMetadata =
  RuleEvaluationResultMetadata & {}

// REGULAR EXPRESSION

export type RuleEvaluationRegularExpressionConfiguration =
  RuleEvaluationConfiguration & {
    Pattern: string
  }
export type RuleEvaluationRegularExpressionResultMetadata =
  RuleEvaluationResultMetadata & {}

// LENGTH COUNT

export type RuleEvaluationLengthCountConfiguration =
  RuleEvaluationConfiguration & {
    Algorithm: 'character' | 'word' | 'sentence' | 'paragraph'
    MinLength?: number
    MaxLength?: number
  }
export type RuleEvaluationLengthCountResultMetadata =
  RuleEvaluationResultMetadata & {}

// LEXICAL OVERLAP

export type RuleEvaluationLexicalOverlapConfiguration =
  RuleEvaluationConfiguration & {
    Algorithm:
      | 'substring'
      | 'levenshtein_distance'
      | 'rouge'
      | 'bleu'
      | 'meteor'
    DatasetLabel: string
  }
export type RuleEvaluationLexicalOverlapResultMetadata =
  RuleEvaluationResultMetadata & {}

// SEMANTIC SIMILARITY

export type RuleEvaluationSemanticSimilarityConfiguration =
  RuleEvaluationConfiguration & {
    Algorithm: 'cosine_similarity'
    EmbeddingModel: 'openai_3_small' | 'anthropic_voyage_3'
    DatasetLabel: string
  }
export type RuleEvaluationSemanticSimilarityResultMetadata =
  RuleEvaluationResultMetadata & {}

/* LLM EVALUATIONS */

export type LlmEvaluationConfiguration = BaseEvaluationConfiguration & {
  ProviderId: string
  Model: string
  Instructions: string
}
export type LlmEvaluationResultMetadata = BaseEvaluationResultMetadata & {
  EvaluationLogId: string
  Reason: string
}

export enum LlmEvaluationMetric {
  Binary = 'binary',
  Rating = 'rating',
  Comparison = 'comparison',
}

// BINARY

export type LlmEvaluationBinaryConfiguration = LlmEvaluationConfiguration & {
  PassDescription: string
  FailDescription: string
}
export type LlmEvaluationBinaryResultMetadata = LlmEvaluationResultMetadata & {}

// RATING

export type LlmEvaluationRatingConfiguration = LlmEvaluationConfiguration & {
  MinRating: number
  MinRatingDescription: string
  MaxRating: number
  MaxRatingDescription: string
}
export type LlmEvaluationRatingResultMetadata = LlmEvaluationResultMetadata & {}

// COMPARISON

export type LlmEvaluationComparisonConfiguration =
  LlmEvaluationConfiguration & {
    DatasetLabel: string
  }
export type LlmEvaluationComparisonResultMetadata =
  LlmEvaluationResultMetadata & {}

/* HUMAN EVALUATIONS */

export type HumanEvaluationConfiguration = BaseEvaluationConfiguration & {
  Instructions: string
}
export type HumanEvaluationResultMetadata = BaseEvaluationResultMetadata & {
  Reason: string
}

export enum HumanEvaluationMetric {
  Binary = 'binary',
  Rating = 'rating',
  Comparison = 'comparison',
}

// BINARY

export type HumanEvaluationBinaryConfiguration =
  HumanEvaluationConfiguration & {
    PassDescription: string
    FailDescription: string
  }
export type HumanEvaluationBinaryResultMetadata =
  HumanEvaluationResultMetadata & {}

// RATING

export type HumanEvaluationRatingConfiguration =
  HumanEvaluationConfiguration & {
    MinRating: number
    MinRatingDescription: string
    MaxRating: number
    MaxRatingDescription: string
  }
export type HumanEvaluationRatingResultMetadata =
  HumanEvaluationResultMetadata & {}

// COMPARISON

export type HumanEvaluationComparisonConfiguration =
  HumanEvaluationConfiguration & {
    DatasetLabel: string
  }
export type HumanEvaluationComparisonResultMetadata =
  HumanEvaluationResultMetadata & {}

// prettier-ignore
export type EvaluationMetric<T extends EvaluationType = EvaluationType> =
  T extends EvaluationType.Rule ? RuleEvaluationMetric :
  T extends EvaluationType.Llm ? LlmEvaluationMetric :
  T extends EvaluationType.Human ? HumanEvaluationMetric :
  never;

// prettier-ignore
export type EvaluationConfiguration<T extends EvaluationMetric = EvaluationMetric> =
  // Rule Evaluations
  T extends RuleEvaluationMetric.ExactMatch ? RuleEvaluationExactMatchConfiguration :
  T extends RuleEvaluationMetric.RegularExpression ? RuleEvaluationRegularExpressionConfiguration :
  T extends RuleEvaluationMetric.LengthCount ? RuleEvaluationLengthCountConfiguration :
  T extends RuleEvaluationMetric.LexicalOverlap ? RuleEvaluationLexicalOverlapConfiguration :
  T extends RuleEvaluationMetric.SemanticSimilarity ? RuleEvaluationSemanticSimilarityConfiguration :
  // Llm Evaluations
  T extends LlmEvaluationMetric.Binary ? LlmEvaluationBinaryConfiguration :
  T extends LlmEvaluationMetric.Rating ? LlmEvaluationRatingConfiguration :
  T extends LlmEvaluationMetric.Comparison ? LlmEvaluationComparisonConfiguration :
  // Human Evaluations
  T extends HumanEvaluationMetric.Binary ? HumanEvaluationBinaryConfiguration :
  T extends HumanEvaluationMetric.Rating ? HumanEvaluationRatingConfiguration :
  T extends HumanEvaluationMetric.Comparison ? HumanEvaluationComparisonConfiguration :
  never;

export enum EvaluationCondition {
  Less = 'less',
  LessEqual = 'less_equal',
  Equal = 'equal',
  NotEqual = 'not_equal',
  Greater = 'greater',
  GreaterEqual = 'greater_equal',
}

// prettier-ignore
export type EvaluationResultMetadata<T extends EvaluationMetric = EvaluationMetric> =
  // Rule Evaluations
  T extends RuleEvaluationMetric.ExactMatch ? RuleEvaluationExactMatchResultMetadata :
  T extends RuleEvaluationMetric.RegularExpression ? RuleEvaluationRegularExpressionResultMetadata :
  T extends RuleEvaluationMetric.LengthCount ? RuleEvaluationLengthCountResultMetadata :
  T extends RuleEvaluationMetric.LexicalOverlap ? RuleEvaluationLexicalOverlapResultMetadata :
  T extends RuleEvaluationMetric.SemanticSimilarity ? RuleEvaluationSemanticSimilarityResultMetadata :
  // Llm Evaluations
  T extends LlmEvaluationMetric.Binary ? LlmEvaluationBinaryResultMetadata :
  T extends LlmEvaluationMetric.Rating ? LlmEvaluationRatingResultMetadata :
  T extends LlmEvaluationMetric.Comparison ? LlmEvaluationComparisonResultMetadata :
  // Human Evaluations
  T extends HumanEvaluationMetric.Binary ? HumanEvaluationBinaryResultMetadata :
  T extends HumanEvaluationMetric.Rating ? HumanEvaluationRatingResultMetadata :
  T extends HumanEvaluationMetric.Comparison ? HumanEvaluationComparisonResultMetadata :
  never;

export type EvaluationV2<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
  C extends EvaluationConfiguration<M> = EvaluationConfiguration<M>,
> = {
  uuid: string
  versionId: number
  workspaceId: number
  commitId: number
  documentUuid: string
  name: string
  description: string
  type: T
  metric: M
  condition: EvaluationCondition
  threshold: number
  configuration: C
  live: boolean | null
  enableSuggestions: boolean | null
  autoApplySuggestions: boolean | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export type EvaluationResultV2<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
  R extends EvaluationResultMetadata<M> = EvaluationResultMetadata<M>,
> = {
  id: number
  uuid: string
  workspaceId: number
  commitId: number
  evaluationUuid: string
  experimentId: number | null
  evaluatedLogId: number
  score: number
  metadata: R
  usedForSuggestion: boolean | null
  createdAt: Date
  updatedAt: Date
}

export const EVALUATION_SCORE_SCALE = 100

export const DEFAULT_EVALUATION_LABEL_NAME = 'expected_output'

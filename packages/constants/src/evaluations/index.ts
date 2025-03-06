import { z } from 'zod'
import {
  HumanEvaluationBinaryConfiguration,
  HumanEvaluationBinaryResultMetadata,
  HumanEvaluationBinarySpecification,
  HumanEvaluationComparisonConfiguration,
  HumanEvaluationComparisonResultMetadata,
  HumanEvaluationComparisonSpecification,
  HumanEvaluationMetric,
  HumanEvaluationRatingConfiguration,
  HumanEvaluationRatingResultMetadata,
  HumanEvaluationRatingSpecification,
} from './human'
import {
  LlmEvaluationBinaryConfiguration,
  LlmEvaluationBinaryResultMetadata,
  LlmEvaluationBinarySpecification,
  LlmEvaluationComparisonConfiguration,
  LlmEvaluationComparisonResultMetadata,
  LlmEvaluationComparisonSpecification,
  LlmEvaluationMetric,
  LlmEvaluationRatingConfiguration,
  LlmEvaluationRatingResultMetadata,
  LlmEvaluationRatingSpecification,
} from './llm'
import {
  RuleEvaluationExactMatchConfiguration,
  RuleEvaluationExactMatchResultMetadata,
  RuleEvaluationExactMatchSpecification,
  RuleEvaluationLengthCountConfiguration,
  RuleEvaluationLengthCountResultMetadata,
  RuleEvaluationLengthCountSpecification,
  RuleEvaluationLexicalOverlapConfiguration,
  RuleEvaluationLexicalOverlapResultMetadata,
  RuleEvaluationLexicalOverlapSpecification,
  RuleEvaluationMetric,
  RuleEvaluationRegularExpressionConfiguration,
  RuleEvaluationRegularExpressionResultMetadata,
  RuleEvaluationRegularExpressionSpecification,
  RuleEvaluationSemanticSimilarityConfiguration,
  RuleEvaluationSemanticSimilarityResultMetadata,
  RuleEvaluationSemanticSimilaritySpecification,
} from './rule'
export * from './human'
export * from './llm'
export * from './rule'

export enum EvaluationType {
  Rule = 'rule',
  Llm = 'llm',
  Human = 'human',
}

export const EvaluationTypeSchema = z.nativeEnum(EvaluationType)

// prettier-ignore
export type EvaluationMetric<T extends EvaluationType = EvaluationType> =
  T extends EvaluationType.Rule ? RuleEvaluationMetric :
  T extends EvaluationType.Llm ? LlmEvaluationMetric :
  T extends EvaluationType.Human ? HumanEvaluationMetric :
  never;

export const EvaluationMetricSchema = z.union([
  z.nativeEnum(RuleEvaluationMetric),
  z.nativeEnum(LlmEvaluationMetric),
  z.nativeEnum(HumanEvaluationMetric),
])

// prettier-ignore
export type EvaluationConfiguration<M extends EvaluationMetric = EvaluationMetric> =
  // Rule Evaluations
  M extends RuleEvaluationMetric.ExactMatch ? RuleEvaluationExactMatchConfiguration :
  M extends RuleEvaluationMetric.RegularExpression ? RuleEvaluationRegularExpressionConfiguration :
  M extends RuleEvaluationMetric.LengthCount ? RuleEvaluationLengthCountConfiguration :
  M extends RuleEvaluationMetric.LexicalOverlap ? RuleEvaluationLexicalOverlapConfiguration :
  M extends RuleEvaluationMetric.SemanticSimilarity ? RuleEvaluationSemanticSimilarityConfiguration :
  // Llm Evaluations
  M extends LlmEvaluationMetric.Binary ? LlmEvaluationBinaryConfiguration :
  M extends LlmEvaluationMetric.Rating ? LlmEvaluationRatingConfiguration :
  M extends LlmEvaluationMetric.Comparison ? LlmEvaluationComparisonConfiguration :
  // Human Evaluations
  M extends HumanEvaluationMetric.Binary ? HumanEvaluationBinaryConfiguration :
  M extends HumanEvaluationMetric.Rating ? HumanEvaluationRatingConfiguration :
  M extends HumanEvaluationMetric.Comparison ? HumanEvaluationComparisonConfiguration :
  never;

export const EvaluationConfigurationSchema = z.custom<EvaluationConfiguration>()

export enum EvaluationCondition {
  Less = 'less',
  LessEqual = 'less_equal',
  Equal = 'equal',
  NotEqual = 'not_equal',
  Greater = 'greater',
  GreaterEqual = 'greater_equal',
}

export const EvaluationConditionSchema = z.nativeEnum(EvaluationCondition)

// prettier-ignore
export type EvaluationResultMetadata<M extends EvaluationMetric = EvaluationMetric> =
  // Rule Evaluations
  M extends RuleEvaluationMetric.ExactMatch ? RuleEvaluationExactMatchResultMetadata :
  M extends RuleEvaluationMetric.RegularExpression ? RuleEvaluationRegularExpressionResultMetadata :
  M extends RuleEvaluationMetric.LengthCount ? RuleEvaluationLengthCountResultMetadata :
  M extends RuleEvaluationMetric.LexicalOverlap ? RuleEvaluationLexicalOverlapResultMetadata :
  M extends RuleEvaluationMetric.SemanticSimilarity ? RuleEvaluationSemanticSimilarityResultMetadata :
  // Llm Evaluations
  M extends LlmEvaluationMetric.Binary ? LlmEvaluationBinaryResultMetadata :
  M extends LlmEvaluationMetric.Rating ? LlmEvaluationRatingResultMetadata :
  M extends LlmEvaluationMetric.Comparison ? LlmEvaluationComparisonResultMetadata :
  // Human Evaluations
  M extends HumanEvaluationMetric.Binary ? HumanEvaluationBinaryResultMetadata :
  M extends HumanEvaluationMetric.Rating ? HumanEvaluationRatingResultMetadata :
  M extends HumanEvaluationMetric.Comparison ? HumanEvaluationComparisonResultMetadata :
  never;

export type EvaluationMetricSpecification<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
  C extends EvaluationConfiguration<M> = EvaluationConfiguration<M>,
  R extends EvaluationResultMetadata<M> = EvaluationResultMetadata<M>,
> = {
  name: string
  description: string
  configuration: z.ZodSchema<C>
  resultMetadata: z.ZodSchema<R>
}

// prettier-ignore
export type EvaluationMetricSpecifications = {
  [T in EvaluationType]: { [M in EvaluationMetric<T>]: EvaluationMetricSpecification<T, M> }
}

// prettier-ignore
export const EVALUATION_METRIC_SPECIFICATIONS: EvaluationMetricSpecifications =
  {
    [EvaluationType.Rule]: {
      [RuleEvaluationMetric.ExactMatch]: RuleEvaluationExactMatchSpecification,
      [RuleEvaluationMetric.RegularExpression]: RuleEvaluationRegularExpressionSpecification,
      [RuleEvaluationMetric.LengthCount]: RuleEvaluationLengthCountSpecification,
      [RuleEvaluationMetric.LexicalOverlap]: RuleEvaluationLexicalOverlapSpecification,
      [RuleEvaluationMetric.SemanticSimilarity]: RuleEvaluationSemanticSimilaritySpecification,
    },
    [EvaluationType.Llm]: {
      [LlmEvaluationMetric.Binary]: LlmEvaluationBinarySpecification,
      [LlmEvaluationMetric.Rating]: LlmEvaluationRatingSpecification,
      [LlmEvaluationMetric.Comparison]: LlmEvaluationComparisonSpecification,
    },
    [EvaluationType.Human]: {
      [HumanEvaluationMetric.Binary]: HumanEvaluationBinarySpecification,
      [HumanEvaluationMetric.Rating]: HumanEvaluationRatingSpecification,
      [HumanEvaluationMetric.Comparison]: HumanEvaluationComparisonSpecification,
    },
  }

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

export type EvaluationSettings<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
  C extends EvaluationConfiguration<M> = EvaluationConfiguration<M>,
> = Pick<
  EvaluationV2<T, M, C>,
  | 'name'
  | 'description'
  | 'type'
  | 'metric'
  | 'condition'
  | 'threshold'
  | 'configuration'
>

export const EvaluationSettingsSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: EvaluationTypeSchema,
  metric: EvaluationMetricSchema,
  condition: EvaluationConditionSchema,
  threshold: z.number(),
  configuration: EvaluationConfigurationSchema,
})

export type EvaluationOptions = Pick<
  EvaluationV2,
  'live' | 'enableSuggestions' | 'autoApplySuggestions'
>

export const EvaluationOptionsSchema = z.object({
  live: z.boolean().nullable(),
  enableSuggestions: z.boolean().nullable(),
  autoApplySuggestions: z.boolean().nullable(),
})

export const EVALUATION_SCORE_SCALE = 100

export const DEFAULT_EVALUATION_LABEL_NAME = 'expected_output'

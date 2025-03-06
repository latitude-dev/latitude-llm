import { z } from 'zod'
import {
  BaseEvaluationConfiguration,
  BaseEvaluationResultMetadata,
} from './shared'

const RuleEvaluationConfiguration = BaseEvaluationConfiguration.extend({})
const RuleEvaluationResultMetadata = BaseEvaluationResultMetadata.extend({})

export enum RuleEvaluationMetric {
  ExactMatch = 'exact_match',
  RegularExpression = 'regular_expression',
  LengthCount = 'length_count',
  LexicalOverlap = 'lexical_overlap',
  SemanticSimilarity = 'semantic_similarity',
}

// EXACT MATCH

export const RuleEvaluationExactMatchSpecification = {
  name: 'Exact Match',
  description:
    'Checks if the response is exactly the same as the expected label',
  configuration: RuleEvaluationConfiguration.extend({
    DatasetLabel: z.string(),
  }),
  resultMetadata: RuleEvaluationResultMetadata.extend({}),
}
export type RuleEvaluationExactMatchConfiguration = z.infer<
  typeof RuleEvaluationExactMatchSpecification.configuration
>
export type RuleEvaluationExactMatchResultMetadata = z.infer<
  typeof RuleEvaluationExactMatchSpecification.resultMetadata
>

// REGULAR EXPRESSION

export const RuleEvaluationRegularExpressionSpecification = {
  name: 'Regular Expression',
  description: 'Checks if the response matches the regular expression',
  configuration: RuleEvaluationConfiguration.extend({
    Pattern: z.string(),
  }),
  resultMetadata: RuleEvaluationResultMetadata.extend({}),
}
export type RuleEvaluationRegularExpressionConfiguration = z.infer<
  typeof RuleEvaluationRegularExpressionSpecification.configuration
>
export type RuleEvaluationRegularExpressionResultMetadata = z.infer<
  typeof RuleEvaluationRegularExpressionSpecification.resultMetadata
>

// LENGTH COUNT

export const RuleEvaluationLengthCountSpecification = {
  name: 'Length Count',
  description: 'Checks if the response is of a certain length',
  configuration: RuleEvaluationConfiguration.extend({
    Algorithm: z.enum(['character', 'word', 'sentence', 'paragraph']),
    MinLength: z.number().optional(),
    MaxLength: z.number().optional(),
  }),
  resultMetadata: RuleEvaluationResultMetadata.extend({}),
}
export type RuleEvaluationLengthCountConfiguration = z.infer<
  typeof RuleEvaluationLengthCountSpecification.configuration
>
export type RuleEvaluationLengthCountResultMetadata = z.infer<
  typeof RuleEvaluationLengthCountSpecification.resultMetadata
>

// LEXICAL OVERLAP

export const RuleEvaluationLexicalOverlapSpecification = {
  name: 'Lexical Overlap',
  description: 'Checks if the response contains the expected label',
  configuration: RuleEvaluationConfiguration.extend({
    Algorithm: z.enum([
      'substring',
      'levenshtein_distance',
      'rouge',
      'bleu',
      'meteor',
    ]),
    DatasetLabel: z.string(),
  }),
  resultMetadata: RuleEvaluationResultMetadata.extend({}),
}
export type RuleEvaluationLexicalOverlapConfiguration = z.infer<
  typeof RuleEvaluationLexicalOverlapSpecification.configuration
>
export type RuleEvaluationLexicalOverlapResultMetadata = z.infer<
  typeof RuleEvaluationLexicalOverlapSpecification.resultMetadata
>

// SEMANTIC SIMILARITY

export const RuleEvaluationSemanticSimilaritySpecification = {
  name: 'Semantic Similarity',
  description:
    'Checks if the response is semantically similar to the expected label',
  configuration: RuleEvaluationConfiguration.extend({
    Algorithm: z.literal('cosine_similarity'),
    EmbeddingModel: z.enum(['openai_3_small', 'anthropic_voyage_3']),
    DatasetLabel: z.string(),
  }),
  resultMetadata: RuleEvaluationResultMetadata.extend({}),
}
export type RuleEvaluationSemanticSimilarityConfiguration = z.infer<
  typeof RuleEvaluationSemanticSimilaritySpecification.configuration
>
export type RuleEvaluationSemanticSimilarityResultMetadata = z.infer<
  typeof RuleEvaluationSemanticSimilaritySpecification.resultMetadata
>

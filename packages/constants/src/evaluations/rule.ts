import { z } from 'zod'
import {
  BaseEvaluationConfiguration,
  BaseEvaluationResultMetadata,
} from './shared'

const ruleEvaluationConfiguration = BaseEvaluationConfiguration.extend({})
const ruleEvaluationResultMetadata = BaseEvaluationResultMetadata.extend({})

// EXACT MATCH

export const RuleEvaluationExactMatchSpecification = {
  name: 'Exact Match',
  description:
    'Checks if the response is exactly the same as the expected label',
  configuration: ruleEvaluationConfiguration.extend({
    DatasetLabel: z.string(),
  }),
  resultMetadata: ruleEvaluationResultMetadata.extend({}),
  supportsLiveEvaluation: false,
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
  configuration: ruleEvaluationConfiguration.extend({
    Pattern: z.string(),
  }),
  resultMetadata: ruleEvaluationResultMetadata.extend({}),
  supportsLiveEvaluation: true,
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
  configuration: ruleEvaluationConfiguration.extend({
    Algorithm: z.enum(['character', 'word', 'sentence', 'paragraph']),
    MinLength: z.number().optional(),
    MaxLength: z.number().optional(),
  }),
  resultMetadata: ruleEvaluationResultMetadata.extend({}),
  supportsLiveEvaluation: true,
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
  configuration: ruleEvaluationConfiguration.extend({
    Algorithm: z.enum([
      'substring',
      'levenshtein_distance',
      'rouge',
      'bleu',
      'meteor',
    ]),
    DatasetLabel: z.string(),
  }),
  resultMetadata: ruleEvaluationResultMetadata.extend({}),
  supportsLiveEvaluation: false,
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
  configuration: ruleEvaluationConfiguration.extend({
    Algorithm: z.literal('cosine_similarity'),
    EmbeddingModel: z.enum(['openai_3_small', 'anthropic_voyage_3']),
    DatasetLabel: z.string(),
  }),
  resultMetadata: ruleEvaluationResultMetadata.extend({}),
  supportsLiveEvaluation: false,
}
export type RuleEvaluationSemanticSimilarityConfiguration = z.infer<
  typeof RuleEvaluationSemanticSimilaritySpecification.configuration
>
export type RuleEvaluationSemanticSimilarityResultMetadata = z.infer<
  typeof RuleEvaluationSemanticSimilaritySpecification.resultMetadata
>

/* ------------------------------------------------------------------------- */

export enum RuleEvaluationMetric {
  ExactMatch = 'exact_match',
  RegularExpression = 'regular_expression',
  LengthCount = 'length_count',
  LexicalOverlap = 'lexical_overlap',
  SemanticSimilarity = 'semantic_similarity',
}

// prettier-ignore
export type RuleEvaluationConfiguration<M extends RuleEvaluationMetric = RuleEvaluationMetric> = 
  M extends RuleEvaluationMetric.ExactMatch ? RuleEvaluationExactMatchConfiguration :
  M extends RuleEvaluationMetric.RegularExpression ? RuleEvaluationRegularExpressionConfiguration :
  M extends RuleEvaluationMetric.LengthCount ? RuleEvaluationLengthCountConfiguration :
  M extends RuleEvaluationMetric.LexicalOverlap ? RuleEvaluationLexicalOverlapConfiguration :
  M extends RuleEvaluationMetric.SemanticSimilarity ? RuleEvaluationSemanticSimilarityConfiguration :
  never;

// prettier-ignore
export type RuleEvaluationResultMetadata<M extends RuleEvaluationMetric = RuleEvaluationMetric> = 
  M extends RuleEvaluationMetric.ExactMatch ? RuleEvaluationExactMatchResultMetadata :
  M extends RuleEvaluationMetric.RegularExpression ? RuleEvaluationRegularExpressionResultMetadata :
  M extends RuleEvaluationMetric.LengthCount ? RuleEvaluationLengthCountResultMetadata :
  M extends RuleEvaluationMetric.LexicalOverlap ? RuleEvaluationLexicalOverlapResultMetadata :
  M extends RuleEvaluationMetric.SemanticSimilarity ? RuleEvaluationSemanticSimilarityResultMetadata :
  never;

export const RuleEvaluationSpecification = {
  name: 'Programmatic Rule',
  description: 'Evaluate responses using a programmatic rule',
  configuration: ruleEvaluationConfiguration,
  resultMetadata: ruleEvaluationResultMetadata,
  // prettier-ignore
  metrics: {
    [RuleEvaluationMetric.ExactMatch]: RuleEvaluationExactMatchSpecification,
    [RuleEvaluationMetric.RegularExpression]: RuleEvaluationRegularExpressionSpecification,
    [RuleEvaluationMetric.LengthCount]: RuleEvaluationLengthCountSpecification,
    [RuleEvaluationMetric.LexicalOverlap]: RuleEvaluationLexicalOverlapSpecification,
    [RuleEvaluationMetric.SemanticSimilarity]: RuleEvaluationSemanticSimilaritySpecification,
  },
}

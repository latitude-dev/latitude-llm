import { z } from 'zod'
import {
  BaseEvaluationConfiguration,
  BaseEvaluationResultError,
  BaseEvaluationResultMetadata,
} from './shared'

const ruleEvaluationConfiguration = BaseEvaluationConfiguration.extend({})
const ruleEvaluationResultMetadata = BaseEvaluationResultMetadata.extend({})
const ruleEvaluationResultError = BaseEvaluationResultError.extend({})

// EXACT MATCH

export const RuleEvaluationExactMatchSpecification = {
  name: 'Exact Match',
  description:
    'Checks if the response is exactly the same as the expected label',
  configuration: ruleEvaluationConfiguration.extend({
    datasetLabel: z.string(),
  }),
  resultMetadata: ruleEvaluationResultMetadata.extend({}),
  resultError: ruleEvaluationResultError.extend({}),
  supportsLiveEvaluation: false,
}
export type RuleEvaluationExactMatchConfiguration = z.infer<
  typeof RuleEvaluationExactMatchSpecification.configuration
>
export type RuleEvaluationExactMatchResultMetadata = z.infer<
  typeof RuleEvaluationExactMatchSpecification.resultMetadata
>
export type RuleEvaluationExactMatchResultError = z.infer<
  typeof RuleEvaluationExactMatchSpecification.resultError
>

// REGULAR EXPRESSION

export const RuleEvaluationRegularExpressionSpecification = {
  name: 'Regular Expression',
  description: 'Checks if the response matches the regular expression',
  configuration: ruleEvaluationConfiguration.extend({
    pattern: z.string(),
  }),
  resultMetadata: ruleEvaluationResultMetadata.extend({}),
  resultError: ruleEvaluationResultError.extend({}),
  supportsLiveEvaluation: true,
}
export type RuleEvaluationRegularExpressionConfiguration = z.infer<
  typeof RuleEvaluationRegularExpressionSpecification.configuration
>
export type RuleEvaluationRegularExpressionResultMetadata = z.infer<
  typeof RuleEvaluationRegularExpressionSpecification.resultMetadata
>
export type RuleEvaluationRegularExpressionResultError = z.infer<
  typeof RuleEvaluationRegularExpressionSpecification.resultError
>

// LENGTH COUNT

export const RuleEvaluationLengthCountSpecification = {
  name: 'Length Count',
  description: 'Checks if the response is of a certain length',
  configuration: ruleEvaluationConfiguration.extend({
    algorithm: z.enum(['character', 'word', 'sentence', 'paragraph']),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
  }),
  resultMetadata: ruleEvaluationResultMetadata.extend({}),
  resultError: ruleEvaluationResultError.extend({}),
  supportsLiveEvaluation: true,
}
export type RuleEvaluationLengthCountConfiguration = z.infer<
  typeof RuleEvaluationLengthCountSpecification.configuration
>
export type RuleEvaluationLengthCountResultMetadata = z.infer<
  typeof RuleEvaluationLengthCountSpecification.resultMetadata
>
export type RuleEvaluationLengthCountResultError = z.infer<
  typeof RuleEvaluationLengthCountSpecification.resultError
>

// LEXICAL OVERLAP

export const RuleEvaluationLexicalOverlapSpecification = {
  name: 'Lexical Overlap',
  description: 'Checks if the response contains the expected label',
  configuration: ruleEvaluationConfiguration.extend({
    algorithm: z.enum([
      'substring',
      'levenshtein_distance',
      'rouge',
      'bleu',
      'meteor',
    ]),
    datasetLabel: z.string(),
  }),
  resultMetadata: ruleEvaluationResultMetadata.extend({}),
  resultError: ruleEvaluationResultError.extend({}),
  supportsLiveEvaluation: false,
}
export type RuleEvaluationLexicalOverlapConfiguration = z.infer<
  typeof RuleEvaluationLexicalOverlapSpecification.configuration
>
export type RuleEvaluationLexicalOverlapResultMetadata = z.infer<
  typeof RuleEvaluationLexicalOverlapSpecification.resultMetadata
>
export type RuleEvaluationLexicalOverlapResultError = z.infer<
  typeof RuleEvaluationLexicalOverlapSpecification.resultError
>

// SEMANTIC SIMILARITY

export const RuleEvaluationSemanticSimilaritySpecification = {
  name: 'Semantic Similarity',
  description:
    'Checks if the response is semantically similar to the expected label',
  configuration: ruleEvaluationConfiguration.extend({
    algorithm: z.literal('cosine_similarity'),
    embeddingModel: z.enum(['openai_3_small', 'anthropic_voyage_3']),
    datasetLabel: z.string(),
  }),
  resultMetadata: ruleEvaluationResultMetadata.extend({}),
  resultError: ruleEvaluationResultError.extend({}),
  supportsLiveEvaluation: false,
}
export type RuleEvaluationSemanticSimilarityConfiguration = z.infer<
  typeof RuleEvaluationSemanticSimilaritySpecification.configuration
>
export type RuleEvaluationSemanticSimilarityResultMetadata = z.infer<
  typeof RuleEvaluationSemanticSimilaritySpecification.resultMetadata
>
export type RuleEvaluationSemanticSimilarityResultError = z.infer<
  typeof RuleEvaluationSemanticSimilaritySpecification.resultError
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

// prettier-ignore
export type RuleEvaluationResultError<M extends RuleEvaluationMetric = RuleEvaluationMetric> = 
  M extends RuleEvaluationMetric.ExactMatch ? RuleEvaluationExactMatchResultError :
  M extends RuleEvaluationMetric.RegularExpression ? RuleEvaluationRegularExpressionResultError :
  M extends RuleEvaluationMetric.LengthCount ? RuleEvaluationLengthCountResultError :
  M extends RuleEvaluationMetric.LexicalOverlap ? RuleEvaluationLexicalOverlapResultError :
  M extends RuleEvaluationMetric.SemanticSimilarity ? RuleEvaluationSemanticSimilarityResultError :
  never;

export const RuleEvaluationSpecification = {
  name: 'Programmatic Rule',
  description: 'Evaluate responses using a programmatic rule',
  configuration: ruleEvaluationConfiguration,
  resultMetadata: ruleEvaluationResultMetadata,
  resultError: ruleEvaluationResultError,
  // prettier-ignore
  metrics: {
    [RuleEvaluationMetric.ExactMatch]: RuleEvaluationExactMatchSpecification,
    [RuleEvaluationMetric.RegularExpression]: RuleEvaluationRegularExpressionSpecification,
    [RuleEvaluationMetric.LengthCount]: RuleEvaluationLengthCountSpecification,
    [RuleEvaluationMetric.LexicalOverlap]: RuleEvaluationLexicalOverlapSpecification,
    [RuleEvaluationMetric.SemanticSimilarity]: RuleEvaluationSemanticSimilaritySpecification,
  },
}

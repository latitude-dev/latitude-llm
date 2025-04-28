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

const ruleEvaluationExactMatchConfiguration =
  ruleEvaluationConfiguration.extend({
    caseInsensitive: z.boolean(),
  })
const ruleEvaluationExactMatchResultMetadata =
  ruleEvaluationResultMetadata.extend({
    configuration: ruleEvaluationExactMatchConfiguration,
  })
const ruleEvaluationExactMatchResultError = ruleEvaluationResultError.extend({})
export const RuleEvaluationExactMatchSpecification = {
  name: 'Exact Match',
  description:
    'Checks if the response is exactly the same as the expected output. The resulting score is "matched" or "unmatched"',
  configuration: ruleEvaluationExactMatchConfiguration,
  resultMetadata: ruleEvaluationExactMatchResultMetadata,
  resultError: ruleEvaluationExactMatchResultError,
  requiresExpectedOutput: true,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
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

const ruleEvaluationRegularExpressionConfiguration =
  ruleEvaluationConfiguration.extend({
    pattern: z.string(),
  })
const ruleEvaluationRegularExpressionResultMetadata =
  ruleEvaluationResultMetadata.extend({
    configuration: ruleEvaluationRegularExpressionConfiguration,
  })
const ruleEvaluationRegularExpressionResultError =
  ruleEvaluationResultError.extend({})
export const RuleEvaluationRegularExpressionSpecification = {
  name: 'Regular Expression',
  description:
    'Checks if the response matches the regular expression. The resulting score is "matched" or "unmatched"',
  configuration: ruleEvaluationRegularExpressionConfiguration,
  resultMetadata: ruleEvaluationRegularExpressionResultMetadata,
  resultError: ruleEvaluationRegularExpressionResultError,
  requiresExpectedOutput: false,
  supportsLiveEvaluation: true,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
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

// SCHEMA VALIDATION

const ruleEvaluationSchemaValidationConfiguration =
  ruleEvaluationConfiguration.extend({
    format: z.enum(['json']),
    schema: z.string(),
  })
const ruleEvaluationSchemaValidationResultMetadata =
  ruleEvaluationResultMetadata.extend({
    configuration: ruleEvaluationSchemaValidationConfiguration,
  })
const ruleEvaluationSchemaValidationResultError =
  ruleEvaluationResultError.extend({})
export const RuleEvaluationSchemaValidationSpecification = {
  name: 'Schema Validation',
  description:
    'Checks if the response follows the schema. The resulting score is "valid" or "invalid"',
  configuration: ruleEvaluationSchemaValidationConfiguration,
  resultMetadata: ruleEvaluationSchemaValidationResultMetadata,
  resultError: ruleEvaluationSchemaValidationResultError,
  requiresExpectedOutput: false,
  supportsLiveEvaluation: true,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
}
export type RuleEvaluationSchemaValidationConfiguration = z.infer<
  typeof RuleEvaluationSchemaValidationSpecification.configuration
>
export type RuleEvaluationSchemaValidationResultMetadata = z.infer<
  typeof RuleEvaluationSchemaValidationSpecification.resultMetadata
>
export type RuleEvaluationSchemaValidationResultError = z.infer<
  typeof RuleEvaluationSchemaValidationSpecification.resultError
>

// LENGTH COUNT

const ruleEvaluationLengthCountConfiguration =
  ruleEvaluationConfiguration.extend({
    algorithm: z.enum(['character', 'word', 'sentence']),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
  })
const ruleEvaluationLengthCountResultMetadata =
  ruleEvaluationResultMetadata.extend({
    configuration: ruleEvaluationLengthCountConfiguration,
  })
const ruleEvaluationLengthCountResultError = ruleEvaluationResultError.extend(
  {},
)
export const RuleEvaluationLengthCountSpecification = {
  name: 'Length Count',
  description:
    'Checks if the response is of a certain length. The resulting score is the length of the response',
  configuration: ruleEvaluationLengthCountConfiguration,
  resultMetadata: ruleEvaluationLengthCountResultMetadata,
  resultError: ruleEvaluationLengthCountResultError,
  requiresExpectedOutput: false,
  supportsLiveEvaluation: true,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
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

const ruleEvaluationLexicalOverlapConfiguration =
  ruleEvaluationConfiguration.extend({
    algorithm: z.enum(['substring', 'levenshtein_distance', 'rouge']),
    minOverlap: z.number().optional(), // Percentage of overlap
    maxOverlap: z.number().optional(), // Percentage of overlap
  })
const ruleEvaluationLexicalOverlapResultMetadata =
  ruleEvaluationResultMetadata.extend({
    configuration: ruleEvaluationLexicalOverlapConfiguration,
  })
const ruleEvaluationLexicalOverlapResultError =
  ruleEvaluationResultError.extend({})
export const RuleEvaluationLexicalOverlapSpecification = {
  name: 'Lexical Overlap',
  description:
    'Checks if the response contains the expected output. The resulting score is the percentage of overlap',
  configuration: ruleEvaluationLexicalOverlapConfiguration,
  resultMetadata: ruleEvaluationLexicalOverlapResultMetadata,
  resultError: ruleEvaluationLexicalOverlapResultError,
  requiresExpectedOutput: true,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
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

const ruleEvaluationSemanticSimilarityConfiguration =
  ruleEvaluationConfiguration.extend({
    algorithm: z.enum(['cosine_distance']),
    minSimilarity: z.number().optional(), // Percentage of similarity
    maxSimilarity: z.number().optional(), // Percentage of similarity
  })
const ruleEvaluationSemanticSimilarityResultMetadata =
  ruleEvaluationResultMetadata.extend({
    configuration: ruleEvaluationSemanticSimilarityConfiguration,
  })
const ruleEvaluationSemanticSimilarityResultError =
  ruleEvaluationResultError.extend({})
export const RuleEvaluationSemanticSimilaritySpecification = {
  name: 'Semantic Similarity',
  description:
    'Checks if the response is semantically similar to the expected output. The resulting score is the percentage of similarity',
  configuration: ruleEvaluationSemanticSimilarityConfiguration,
  resultMetadata: ruleEvaluationSemanticSimilarityResultMetadata,
  resultError: ruleEvaluationSemanticSimilarityResultError,
  requiresExpectedOutput: true,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
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
  SchemaValidation = 'schema_validation',
  LengthCount = 'length_count',
  LexicalOverlap = 'lexical_overlap',
  SemanticSimilarity = 'semantic_similarity',
}

// prettier-ignore
export type RuleEvaluationConfiguration<M extends RuleEvaluationMetric = RuleEvaluationMetric> = 
  M extends RuleEvaluationMetric.ExactMatch ? RuleEvaluationExactMatchConfiguration :
  M extends RuleEvaluationMetric.RegularExpression ? RuleEvaluationRegularExpressionConfiguration :
  M extends RuleEvaluationMetric.SchemaValidation ? RuleEvaluationSchemaValidationConfiguration :
  M extends RuleEvaluationMetric.LengthCount ? RuleEvaluationLengthCountConfiguration :
  M extends RuleEvaluationMetric.LexicalOverlap ? RuleEvaluationLexicalOverlapConfiguration :
  M extends RuleEvaluationMetric.SemanticSimilarity ? RuleEvaluationSemanticSimilarityConfiguration :
  never;

// prettier-ignore
export type RuleEvaluationResultMetadata<M extends RuleEvaluationMetric = RuleEvaluationMetric> = 
  M extends RuleEvaluationMetric.ExactMatch ? RuleEvaluationExactMatchResultMetadata :
  M extends RuleEvaluationMetric.RegularExpression ? RuleEvaluationRegularExpressionResultMetadata :
  M extends RuleEvaluationMetric.SchemaValidation ? RuleEvaluationSchemaValidationResultMetadata :
  M extends RuleEvaluationMetric.LengthCount ? RuleEvaluationLengthCountResultMetadata :
  M extends RuleEvaluationMetric.LexicalOverlap ? RuleEvaluationLexicalOverlapResultMetadata :
  M extends RuleEvaluationMetric.SemanticSimilarity ? RuleEvaluationSemanticSimilarityResultMetadata :
  never;

// prettier-ignore
export type RuleEvaluationResultError<M extends RuleEvaluationMetric = RuleEvaluationMetric> = 
  M extends RuleEvaluationMetric.ExactMatch ? RuleEvaluationExactMatchResultError :
  M extends RuleEvaluationMetric.RegularExpression ? RuleEvaluationRegularExpressionResultError :
  M extends RuleEvaluationMetric.SchemaValidation ? RuleEvaluationSchemaValidationResultError :
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
    [RuleEvaluationMetric.SchemaValidation]: RuleEvaluationSchemaValidationSpecification,
    [RuleEvaluationMetric.LengthCount]: RuleEvaluationLengthCountSpecification,
    [RuleEvaluationMetric.LexicalOverlap]: RuleEvaluationLexicalOverlapSpecification,
    [RuleEvaluationMetric.SemanticSimilarity]: RuleEvaluationSemanticSimilaritySpecification,
  },
}

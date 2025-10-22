import { z } from 'zod'
import { EvaluationResultSuccessValue, EvaluationType } from './index'
import {
  baseEvaluationConfiguration,
  baseEvaluationResultError,
  baseEvaluationResultMetadata,
} from './shared'

const ruleEvaluationConfiguration = baseEvaluationConfiguration.extend({})
const ruleEvaluationResultMetadata = baseEvaluationResultMetadata.extend({
  reason: z.string().optional(),
})
const ruleEvaluationResultError = baseEvaluationResultError.extend({})

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
  resultReason: (
    result: EvaluationResultSuccessValue<
      EvaluationType.Rule,
      RuleEvaluationMetric.ExactMatch
    >,
  ) => {
    let reason = ''

    if (result.score === 1) {
      reason = `Response is`
    } else {
      reason = `Response is not`
    }

    reason += ` exactly the same as '${result.metadata.expectedOutput}'`

    if (result.metadata.configuration.caseInsensitive) {
      reason += ' (comparison is case-insensitive)'
    }

    if (result.metadata.reason) {
      reason += `, because: ${result.metadata.reason}`
    }

    return reason + '.'
  },
  requiresExpectedOutput: true,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
} as const
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
  resultReason: (
    result: EvaluationResultSuccessValue<
      EvaluationType.Rule,
      RuleEvaluationMetric.RegularExpression
    >,
  ) => {
    let reason = ''

    if (result.score === 1) {
      reason = `Response matches`
    } else {
      reason = `Response does not match`
    }

    reason += ` the regular expression \`/${result.metadata.configuration.pattern}/gm\``

    if (result.metadata.reason) {
      reason += `, because: ${result.metadata.reason}`
    }

    return reason + '.'
  },
  requiresExpectedOutput: false,
  supportsLiveEvaluation: true,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
} as const
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
  resultReason: (
    result: EvaluationResultSuccessValue<
      EvaluationType.Rule,
      RuleEvaluationMetric.SchemaValidation
    >,
  ) => {
    let reason = ''

    if (result.score === 1) {
      reason = `Response follows`
    } else {
      reason = `Response does not follow`
    }

    reason += ` the ${result.metadata.configuration.format.toUpperCase()} schema:\n\`\`\`\n${result.metadata.configuration.schema}\n\`\`\``

    if (result.metadata.reason) {
      reason += `\nbecause: ${result.metadata.reason}`
    }

    return reason + '.'
  },
  requiresExpectedOutput: false,
  supportsLiveEvaluation: true,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
} as const
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
  resultReason: (
    result: EvaluationResultSuccessValue<
      EvaluationType.Rule,
      RuleEvaluationMetric.LengthCount
    >,
  ) => {
    let reason = `Response length is ${result.score} ${result.metadata.configuration.algorithm}s`

    if (result.hasPassed) {
      reason += ', which is'
    } else {
      reason += ', which is not'
    }

    reason += ` between ${result.metadata.configuration.minLength ?? 0} and ${result.metadata.configuration.maxLength ?? Infinity} ${result.metadata.configuration.algorithm}s`

    if (result.metadata.configuration.reverseScale) {
      reason += ' (shorter is better)'
    } else {
      reason += ' (longer is better)'
    }

    if (result.metadata.reason) {
      reason += `, because: ${result.metadata.reason}`
    }

    return reason + '.'
  },
  requiresExpectedOutput: false,
  supportsLiveEvaluation: true,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
} as const
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
  resultReason: (
    result: EvaluationResultSuccessValue<
      EvaluationType.Rule,
      RuleEvaluationMetric.LexicalOverlap
    >,
  ) => {
    let reason = `Response lexical overlap with '${result.metadata.expectedOutput}' is ${result.score.toFixed(0)}%`

    if (result.hasPassed) {
      reason += ', which is'
    } else {
      reason += ', which is not'
    }

    reason += ` between ${(result.metadata.configuration.minOverlap ?? 0).toFixed(0)}% and ${(result.metadata.configuration.maxOverlap ?? 100).toFixed(0)}%`

    if (result.metadata.configuration.reverseScale) {
      reason += ' (lower is better)'
    } else {
      reason += ' (higher is better)'
    }

    if (result.metadata.reason) {
      reason += `, because: ${result.metadata.reason}`
    }

    return reason + '.'
  },
  requiresExpectedOutput: true,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
} as const
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
  resultReason: (
    result: EvaluationResultSuccessValue<
      EvaluationType.Rule,
      RuleEvaluationMetric.SemanticSimilarity
    >,
  ) => {
    let reason = `Response semantic similarity with '${result.metadata.expectedOutput}' is ${result.score.toFixed(0)}%`

    if (result.hasPassed) {
      reason += ', which is'
    } else {
      reason += ', which is not'
    }

    reason += ` between ${(result.metadata.configuration.minSimilarity ?? 0).toFixed(0)}% and ${(result.metadata.configuration.maxSimilarity ?? 100).toFixed(0)}%`

    if (result.metadata.configuration.reverseScale) {
      reason += ' (lower is better)'
    } else {
      reason += ' (higher is better)'
    }

    if (result.metadata.reason) {
      reason += `, because: ${result.metadata.reason}`
    }

    return reason + '.'
  },
  requiresExpectedOutput: true,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
} as const
export type RuleEvaluationSemanticSimilarityConfiguration = z.infer<
  typeof RuleEvaluationSemanticSimilaritySpecification.configuration
>
export type RuleEvaluationSemanticSimilarityResultMetadata = z.infer<
  typeof RuleEvaluationSemanticSimilaritySpecification.resultMetadata
>
export type RuleEvaluationSemanticSimilarityResultError = z.infer<
  typeof RuleEvaluationSemanticSimilaritySpecification.resultError
>

// NUMERIC SIMILARITY

const ruleEvaluationNumericSimilarityConfiguration =
  ruleEvaluationConfiguration.extend({
    algorithm: z.enum(['relative_difference']),
    minSimilarity: z.number().optional(), // Percentage of similarity
    maxSimilarity: z.number().optional(), // Percentage of similarity
  })
const ruleEvaluationNumericSimilarityResultMetadata =
  ruleEvaluationResultMetadata.extend({
    configuration: ruleEvaluationNumericSimilarityConfiguration,
  })
const ruleEvaluationNumericSimilarityResultError =
  ruleEvaluationResultError.extend({})
export const RuleEvaluationNumericSimilaritySpecification = {
  name: 'Numeric Similarity',
  description:
    'Checks if the response is numerically similar to the expected output. The resulting score is the percentage of similarity',
  configuration: ruleEvaluationNumericSimilarityConfiguration,
  resultMetadata: ruleEvaluationNumericSimilarityResultMetadata,
  resultError: ruleEvaluationNumericSimilarityResultError,
  resultReason: (
    result: EvaluationResultSuccessValue<
      EvaluationType.Rule,
      RuleEvaluationMetric.NumericSimilarity
    >,
  ) => {
    let reason = `Response numeric similarity with '${result.metadata.expectedOutput}' is ${result.score.toFixed(0)}%`

    if (result.hasPassed) {
      reason += ', which is'
    } else {
      reason += ', which is not'
    }

    reason += ` between ${(result.metadata.configuration.minSimilarity ?? 0).toFixed(0)}% and ${(result.metadata.configuration.maxSimilarity ?? 100).toFixed(0)}%`

    if (result.metadata.configuration.reverseScale) {
      reason += ' (lower is better)'
    } else {
      reason += ' (higher is better)'
    }

    if (result.metadata.reason) {
      reason += `, because: ${result.metadata.reason}`
    }

    return reason + '.'
  },
  requiresExpectedOutput: true,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
} as const
export type RuleEvaluationNumericSimilarityConfiguration = z.infer<
  typeof RuleEvaluationNumericSimilaritySpecification.configuration
>
export type RuleEvaluationNumericSimilarityResultMetadata = z.infer<
  typeof RuleEvaluationNumericSimilaritySpecification.resultMetadata
>
export type RuleEvaluationNumericSimilarityResultError = z.infer<
  typeof RuleEvaluationNumericSimilaritySpecification.resultError
>

/* ------------------------------------------------------------------------- */

export enum RuleEvaluationMetric {
  ExactMatch = 'exact_match',
  RegularExpression = 'regular_expression',
  SchemaValidation = 'schema_validation',
  LengthCount = 'length_count',
  LexicalOverlap = 'lexical_overlap',
  SemanticSimilarity = 'semantic_similarity',
  NumericSimilarity = 'numeric_similarity',
}

// prettier-ignore
export type RuleEvaluationConfiguration<M extends RuleEvaluationMetric = RuleEvaluationMetric> = 
  M extends RuleEvaluationMetric.ExactMatch ? RuleEvaluationExactMatchConfiguration :
  M extends RuleEvaluationMetric.RegularExpression ? RuleEvaluationRegularExpressionConfiguration :
  M extends RuleEvaluationMetric.SchemaValidation ? RuleEvaluationSchemaValidationConfiguration :
  M extends RuleEvaluationMetric.LengthCount ? RuleEvaluationLengthCountConfiguration :
  M extends RuleEvaluationMetric.LexicalOverlap ? RuleEvaluationLexicalOverlapConfiguration :
  M extends RuleEvaluationMetric.SemanticSimilarity ? RuleEvaluationSemanticSimilarityConfiguration :
  M extends RuleEvaluationMetric.NumericSimilarity ? RuleEvaluationNumericSimilarityConfiguration :
  never;

// prettier-ignore
export type RuleEvaluationResultMetadata<M extends RuleEvaluationMetric = RuleEvaluationMetric> = 
  M extends RuleEvaluationMetric.ExactMatch ? RuleEvaluationExactMatchResultMetadata :
  M extends RuleEvaluationMetric.RegularExpression ? RuleEvaluationRegularExpressionResultMetadata :
  M extends RuleEvaluationMetric.SchemaValidation ? RuleEvaluationSchemaValidationResultMetadata :
  M extends RuleEvaluationMetric.LengthCount ? RuleEvaluationLengthCountResultMetadata :
  M extends RuleEvaluationMetric.LexicalOverlap ? RuleEvaluationLexicalOverlapResultMetadata :
  M extends RuleEvaluationMetric.SemanticSimilarity ? RuleEvaluationSemanticSimilarityResultMetadata :
  M extends RuleEvaluationMetric.NumericSimilarity ? RuleEvaluationNumericSimilarityResultMetadata :
  never;

// prettier-ignore
export type RuleEvaluationResultError<M extends RuleEvaluationMetric = RuleEvaluationMetric> = 
  M extends RuleEvaluationMetric.ExactMatch ? RuleEvaluationExactMatchResultError :
  M extends RuleEvaluationMetric.RegularExpression ? RuleEvaluationRegularExpressionResultError :
  M extends RuleEvaluationMetric.SchemaValidation ? RuleEvaluationSchemaValidationResultError :
  M extends RuleEvaluationMetric.LengthCount ? RuleEvaluationLengthCountResultError :
  M extends RuleEvaluationMetric.LexicalOverlap ? RuleEvaluationLexicalOverlapResultError :
  M extends RuleEvaluationMetric.SemanticSimilarity ? RuleEvaluationSemanticSimilarityResultError :
  M extends RuleEvaluationMetric.NumericSimilarity ? RuleEvaluationNumericSimilarityResultError :
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
    [RuleEvaluationMetric.NumericSimilarity]: RuleEvaluationNumericSimilaritySpecification,
  },
} as const

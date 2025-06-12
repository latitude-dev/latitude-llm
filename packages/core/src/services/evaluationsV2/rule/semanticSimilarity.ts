import { createOpenAI } from '@ai-sdk/openai'
import { env } from '@latitude-data/env'
import { embedMany } from 'ai'
import similarity from 'compute-cosine-similarity'
import {
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationSemanticSimilaritySpecification as specification,
} from '../../../browser'
import { database, Database } from '../../../client'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'
import { BadRequestError } from './../../../lib/errors'
import { Result } from './../../../lib/Result'

export const RuleEvaluationSemanticSimilaritySpecification = {
  ...specification,
  validate: validate,
  run: run,
}

async function validate(
  {
    configuration,
  }: EvaluationMetricValidateArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.SemanticSimilarity
  >,
  _: Database = database,
) {
  if (
    configuration.minSimilarity !== undefined &&
    (configuration.minSimilarity < 0 || configuration.minSimilarity > 100)
  ) {
    return Result.error(
      new BadRequestError(
        'Minimum similarity must be a number between 0 and 100',
      ),
    )
  }

  if (
    configuration.maxSimilarity !== undefined &&
    (configuration.maxSimilarity < 0 || configuration.maxSimilarity > 100)
  ) {
    return Result.error(
      new BadRequestError(
        'Maximum similarity must be a number between 0 and 100',
      ),
    )
  }

  if (
    configuration.minSimilarity !== undefined &&
    configuration.maxSimilarity !== undefined &&
    configuration.minSimilarity >= configuration.maxSimilarity
  ) {
    return Result.error(
      new BadRequestError(
        'Minimum similarity must be less than maximum similarity',
      ),
    )
  }

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
    actualOutput: configuration.actualOutput,
    expectedOutput: configuration.expectedOutput,
    algorithm: configuration.algorithm,
    minSimilarity: configuration.minSimilarity,
    maxSimilarity: configuration.maxSimilarity,
  })
}

async function run(
  {
    evaluation,
    actualOutput,
    expectedOutput,
    datasetLabel,
  }: EvaluationMetricRunArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.SemanticSimilarity
  >,
  _: Database = database,
) {
  const metadata = {
    configuration: evaluation.configuration,
    actualOutput: actualOutput,
    expectedOutput: expectedOutput,
    datasetLabel: datasetLabel,
  }

  if (!metadata.expectedOutput) {
    throw new BadRequestError('Expected output is required')
  }

  if (!env.OPENAI_API_KEY) {
    throw new BadRequestError('Internal OPENAI_API_KEY is not set')
  }

  const {
    embeddings: [actualEmbedding, expectedEmbedding],
  } = await embedMany({
    model: createOpenAI({
      apiKey: env.OPENAI_API_KEY,
      compatibility: 'strict',
    }).textEmbeddingModel('text-embedding-3-small'),
    values: [metadata.actualOutput, metadata.expectedOutput],
  })

  let score = 0

  switch (metadata.configuration.algorithm) {
    case 'cosine_distance':
      {
        score = (similarity(actualEmbedding!, expectedEmbedding!) ?? 0) * 100
      }
      break
    default:
      throw new Error('Invalid similarity algorithm')
  }

  score = Math.min(Math.max(Number(score.toFixed(0)), 0), 100)

  let normalizedScore = normalizeScore(score, 0, 100)
  if (metadata.configuration.reverseScale) {
    normalizedScore = normalizeScore(score, 100, 0)
  }

  const minSimilarity = metadata.configuration.minSimilarity ?? 0
  const maxSimilarity = metadata.configuration.maxSimilarity ?? 100
  const hasPassed = score >= minSimilarity && score <= maxSimilarity

  return { score, normalizedScore, metadata, hasPassed }
}

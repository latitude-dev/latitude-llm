import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { z } from 'zod'
import { database } from '../../../client'
import {
  EvaluationType,
  LLM_EVALUATION_CUSTOM_PROMPT_DOCUMENTATION,
  LlmEvaluationMetric,
  LlmEvaluationRatingResultMetadata,
  LlmEvaluationRatingSpecification as specification,
} from '../../../constants'
import { formatConversation } from '../../../helpers'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { serialize as serializeDocumentLog } from '../../documentLogs/serialize'
import {
  EvaluationMetricCloneArgs,
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'
import { promptTask, runPrompt } from './shared'

export const LlmEvaluationRatingSpecification = {
  ...specification,
  validate: validate,
  run: run,
  clone: clone,
}

async function validate(
  {
    configuration,
  }: EvaluationMetricValidateArgs<
    EvaluationType.Llm,
    LlmEvaluationMetric.Rating
  >,
  _ = database,
) {
  configuration.criteria = configuration.criteria.trim()
  if (!configuration.criteria) {
    return Result.error(new BadRequestError('Criteria is required'))
  }

  if (configuration.minRating >= configuration.maxRating) {
    return Result.error(
      new BadRequestError('Minimum rating must be less than maximum rating'),
    )
  }

  configuration.minRatingDescription = configuration.minRatingDescription.trim()
  if (!configuration.minRatingDescription) {
    return Result.error(
      new BadRequestError('Minimum rating description is required'),
    )
  }

  configuration.maxRatingDescription = configuration.maxRatingDescription.trim()
  if (!configuration.maxRatingDescription) {
    return Result.error(
      new BadRequestError('Maximum rating description is required'),
    )
  }

  if (
    configuration.minThreshold !== undefined &&
    (configuration.minThreshold < configuration.minRating ||
      configuration.minThreshold > configuration.maxRating)
  ) {
    return Result.error(
      new BadRequestError(
        `Minimum threshold must be a number between ${configuration.minRating} and ${configuration.maxRating}`,
      ),
    )
  }

  if (
    configuration.maxThreshold !== undefined &&
    (configuration.maxThreshold < configuration.minRating ||
      configuration.maxThreshold > configuration.maxRating)
  ) {
    return Result.error(
      new BadRequestError(
        `Maximum threshold must be a number between ${configuration.minRating} and ${configuration.maxRating}`,
      ),
    )
  }

  if (
    configuration.minThreshold !== undefined &&
    configuration.maxThreshold !== undefined &&
    configuration.minThreshold >= configuration.maxThreshold
  ) {
    return Result.error(
      new BadRequestError(
        'Minimum threshold must be less than maximum threshold',
      ),
    )
  }

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
    actualOutput: configuration.actualOutput,
    expectedOutput: configuration.expectedOutput,
    provider: configuration.provider,
    model: configuration.model,
    criteria: configuration.criteria,
    minRating: configuration.minRating,
    minRatingDescription: configuration.minRatingDescription,
    maxRating: configuration.maxRating,
    maxRatingDescription: configuration.maxRatingDescription,
    minThreshold: configuration.minThreshold,
    maxThreshold: configuration.maxThreshold,
  })
}

export function buildPrompt({
  provider,
  model,
  criteria,
  minRating,
  minRatingDescription,
  maxRating,
  maxRatingDescription,
}: {
  provider: ProviderApiKey
  model: string
  criteria: string
  minRating: number
  minRatingDescription: string
  maxRating: number
  maxRatingDescription: string
}) {
  return `
---
provider: ${provider.name}
model: ${model}
temperature: ${model.toLowerCase().startsWith('gpt-5') ? 1 : 0.7}
---

You're an expert LLM-as-a-judge evaluator. Your task is to judge whether the response, from another LLM model (the assistant), meets the following criteria:
${criteria}

The resulting verdict is an integer number between \`${minRating}\`, if the response does not meet the criteria, and \`${maxRating}\` otherwise, where:
- \`${minRating}\` represents "${minRatingDescription}"
- \`${maxRating}\` represents "${maxRatingDescription}"

${promptTask()}

You must give your verdict as a single JSON object with the following properties:
- rating (number): An integer number between \`${minRating}\` and \`${maxRating}\`.
- reason (string): A string explaining your evaluation decision.
`.trim()
}

function grade({
  score,
  metadata,
}: {
  score: number
  metadata: LlmEvaluationRatingResultMetadata
}) {
  let normalizedScore = normalizeScore(
    score,
    metadata.configuration.minRating,
    metadata.configuration.maxRating,
  )
  if (metadata.configuration.reverseScale) {
    normalizedScore = normalizeScore(
      score,
      metadata.configuration.maxRating,
      metadata.configuration.minRating,
    )
  }

  const minThreshold =
    metadata.configuration.minThreshold ?? metadata.configuration.minRating
  const maxThreshold =
    metadata.configuration.maxThreshold ?? metadata.configuration.maxRating
  const hasPassed = score >= minThreshold && score <= maxThreshold

  return { score, normalizedScore, metadata, hasPassed }
}

async function run(
  {
    resultUuid,
    evaluation,
    actualOutput,
    conversation,
    documentLog,
    providers,
    commit,
    workspace,
  }: EvaluationMetricRunArgs<EvaluationType.Llm, LlmEvaluationMetric.Rating>,
  db = database,
) {
  const metadata = {
    configuration: evaluation.configuration,
    actualOutput: actualOutput.value ?? '',
    evaluationLogId: -1,
    reason: '',
    tokens: 0,
    cost: 0,
    duration: 0,
  }

  if (actualOutput.error) {
    metadata.reason = actualOutput.error.message
    return grade({ score: 0, metadata })
  }

  const provider = providers?.get(metadata.configuration.provider)
  if (!provider) {
    throw new BadRequestError('Provider is required')
  }

  const evaluatedLog = await serializeDocumentLog(
    { documentLog, workspace },
    db,
  ).then((r) => r.unwrap())

  const promptSchema = z.object({
    rating: z
      .int()
      .min(metadata.configuration.minRating)
      .max(metadata.configuration.maxRating),
    reason: z.string(),
  })

  let result
  try {
    result = await runPrompt({
      prompt: buildPrompt({ ...metadata.configuration, provider: provider }),
      parameters: {
        ...evaluatedLog,
        actualOutput: actualOutput,
        conversation: formatConversation(conversation),
      },
      schema: promptSchema,
      resultUuid: resultUuid,
      evaluation: evaluation,
      providers: providers!,
      commit: commit,
      workspace: workspace,
    })
  } catch (error) {
    if (
      error instanceof ChainError &&
      error.errorCode === RunErrorCodes.InvalidResponseFormatError
    ) {
      metadata.reason = error.message
      return grade({ score: 0, metadata })
    }

    throw error
  }

  metadata.evaluationLogId = result.response.providerLog!.id
  metadata.reason = result.verdict.reason
  metadata.tokens = result.stats.tokens
  metadata.cost = result.stats.costInMillicents
  metadata.duration = result.stats.duration

  const score = Math.min(
    Math.max(
      Number(result.verdict.rating.toFixed(0)),
      metadata.configuration.minRating,
    ),
    metadata.configuration.maxRating,
  )

  return grade({ score, metadata })
}

async function clone(
  {
    evaluation,
    providers,
  }: EvaluationMetricCloneArgs<EvaluationType.Llm, LlmEvaluationMetric.Rating>,
  _ = database,
) {
  const provider = providers?.get(evaluation.configuration.provider)
  if (!provider) {
    return Result.error(new BadRequestError('Provider is required'))
  }

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original evaluation object
  return Result.ok({
    name: evaluation.name,
    description: evaluation.description,
    type: EvaluationType.Llm,
    metric: LlmEvaluationMetric.Custom,
    configuration: {
      reverseScale: evaluation.configuration.reverseScale,
      actualOutput: evaluation.configuration.actualOutput,
      expectedOutput: evaluation.configuration.expectedOutput,
      provider: evaluation.configuration.provider,
      model: evaluation.configuration.model,
      prompt: `
${LLM_EVALUATION_CUSTOM_PROMPT_DOCUMENTATION}

${buildPrompt({ ...evaluation.configuration, provider })}

/*
  This evaluation has been cloned. The verdict has been changed from "rating" to "score". Feel free to modify the prompt.
*/
`.trim(),
      minScore: evaluation.configuration.minRating,
      maxScore: evaluation.configuration.maxRating,
      minThreshold: evaluation.configuration.minThreshold,
      maxThreshold: evaluation.configuration.maxThreshold,
    },
  })
}

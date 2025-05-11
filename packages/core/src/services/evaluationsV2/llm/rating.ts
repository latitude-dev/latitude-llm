import { z } from 'zod'
import {
  EvaluationType,
  formatConversation,
  LLM_EVALUATION_CUSTOM_PROMPT_DOCUMENTATION,
  LlmEvaluationMetric,
  ProviderApiKey,
  LlmEvaluationRatingSpecification as specification,
} from '../../../browser'
import { database, Database } from '../../../client'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
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
  _: Database = database,
) {
  if (!configuration.criteria) {
    return Result.error(new BadRequestError('Criteria is required'))
  }

  if (configuration.minRating >= configuration.maxRating) {
    return Result.error(
      new BadRequestError('Minimum rating must be less than maximum rating'),
    )
  }

  if (!configuration.minRatingDescription) {
    return Result.error(
      new BadRequestError('Minimum rating description is required'),
    )
  }

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
temperature: 0.7
---

You're an expert LLM-as-a-judge evaluator. Your task is to judge whether the response, from another LLM model (the assistant), meets the following criteria:
${criteria}

The resulting verdict is an integer number between \`${minRating}\`, if the response does not meet the criteria, and \`${maxRating}\` otherwise, where:
- \`${minRating}\` represents "${minRatingDescription}"
- \`${maxRating}\` represents "${maxRatingDescription}"

${promptTask({ provider })}

You must give your verdict as a single JSON object with the following properties:
- rating (number): An integer number between \`${minRating}\` and \`${maxRating}\`.
- reason (string): A string explaining your evaluation decision.
`.trim()
}

async function run(
  {
    resultUuid,
    evaluation,
    actualOutput,
    conversation,
    documentLog,
    providers,
    workspace,
  }: EvaluationMetricRunArgs<EvaluationType.Llm, LlmEvaluationMetric.Rating>,
  db: Database = database,
) {
  let metadata = {
    configuration: evaluation.configuration,
    actualOutput: actualOutput,
    evaluationLogId: -1,
    reason: '',
    tokens: 0,
    cost: 0,
    duration: 0,
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
      .number()
      .int()
      .min(metadata.configuration.minRating)
      .max(metadata.configuration.maxRating),
    reason: z.string(),
  })

  const { response, stats, verdict } = await runPrompt({
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
    workspace: workspace,
  })

  metadata.evaluationLogId = response.providerLog!.id
  metadata.reason = verdict.reason
  metadata.tokens = stats.tokens
  metadata.cost = stats.costInMillicents
  metadata.duration = stats.duration

  const score = Math.min(
    Math.max(
      Number(verdict.rating.toFixed(0)),
      metadata.configuration.minRating,
    ),
    metadata.configuration.maxRating,
  )

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

async function clone(
  {
    evaluation,
    providers,
  }: EvaluationMetricCloneArgs<EvaluationType.Llm, LlmEvaluationMetric.Rating>,
  _: Database = database,
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

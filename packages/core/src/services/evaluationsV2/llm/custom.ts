import { scan } from 'promptl-ai'
import { z } from 'zod'
import {
  EvaluationType,
  formatConversation,
  LlmEvaluationMetric,
  LlmEvaluationCustomSpecification as specification,
} from '../../../browser'
import { database, Database } from '../../../client'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { serialize as serializeDocumentLog } from '../../documentLogs/serialize'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'
import { runPrompt } from './shared'

export const LlmEvaluationCustomSpecification = {
  ...specification,
  validate: validate,
  run: run,
}

async function validate(
  {
    configuration,
  }: EvaluationMetricValidateArgs<
    EvaluationType.Llm,
    LlmEvaluationMetric.Custom
  >,
  _: Database = database,
) {
  if (configuration.prompt === undefined) {
    return Result.error(new BadRequestError('Prompt is required'))
  }

  try {
    const { config } = await scan({ prompt: configuration.prompt })
    configuration.provider = (config.provider as string | undefined) ?? ''
    configuration.model = (config.model as string | undefined) ?? ''
  } catch (_) {
    // Note: we allow to save an invalid prompt to avoid bad
    // user experience when automatically saving the prompt
  }

  if (configuration.minScore >= configuration.maxScore) {
    return Result.error(
      new BadRequestError('Minimum score must be less than maximum score'),
    )
  }

  if (
    configuration.minThreshold !== undefined &&
    (configuration.minThreshold < configuration.minScore ||
      configuration.minThreshold > configuration.maxScore)
  ) {
    return Result.error(
      new BadRequestError(
        `Minimum threshold must be a number between ${configuration.minScore} and ${configuration.maxScore}`,
      ),
    )
  }

  if (
    configuration.maxThreshold !== undefined &&
    (configuration.maxThreshold < configuration.minScore ||
      configuration.maxThreshold > configuration.maxScore)
  ) {
    return Result.error(
      new BadRequestError(
        `Maximum threshold must be a number between ${configuration.minScore} and ${configuration.maxScore}`,
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
    prompt: configuration.prompt,
    minScore: configuration.minScore,
    maxScore: configuration.maxScore,
    minThreshold: configuration.minThreshold,
    maxThreshold: configuration.maxThreshold,
  })
}

// Note: match legacy and cloned verdict schemas to avoid breaking prompts
const ALIAS_VERDICT_KEYS = ['passed', 'rating', 'value', 'result'] as const
function aliasVerdict(raw: unknown) {
  if (typeof raw !== 'object') return raw
  if (raw === null || raw === undefined) return raw
  if ('score' in raw) return raw

  const obj = { ...raw } as Record<string, unknown>
  for (const key of ALIAS_VERDICT_KEYS) {
    if (key in obj) obj.score = Number(obj[key])
    delete obj[key]
  }

  return obj
}

async function run(
  {
    resultUuid,
    evaluation,
    actualOutput,
    expectedOutput,
    datasetLabel,
    conversation,
    documentLog,
    providers,
    workspace,
  }: EvaluationMetricRunArgs<EvaluationType.Llm, LlmEvaluationMetric.Custom>,
  db: Database = database,
) {
  // Note: expectedOutput is optional for this metric as this function
  // is reused for both, custom and custom labeled, llm metrics

  let metadata = {
    configuration: evaluation.configuration,
    actualOutput: actualOutput,
    datasetLabel: datasetLabel,
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

  const promptSchema = z.preprocess(
    aliasVerdict,
    z.object({
      score: z
        .number()
        .int()
        .min(metadata.configuration.minScore)
        .max(metadata.configuration.maxScore),
      reason: z.string(),
    }),
  )

  const { response, stats, verdict } = await runPrompt({
    prompt: metadata.configuration.prompt,
    parameters: {
      ...evaluatedLog,
      actualOutput: actualOutput,
      expectedOutput: expectedOutput,
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
    Math.max(Number(verdict.score.toFixed(0)), metadata.configuration.minScore),
    metadata.configuration.maxScore,
  )

  let normalizedScore = normalizeScore(
    score,
    metadata.configuration.minScore,
    metadata.configuration.maxScore,
  )
  if (metadata.configuration.reverseScale) {
    normalizedScore = normalizeScore(
      score,
      metadata.configuration.maxScore,
      metadata.configuration.minScore,
    )
  }

  const minThreshold =
    metadata.configuration.minThreshold ?? metadata.configuration.minScore
  const maxThreshold =
    metadata.configuration.maxThreshold ?? metadata.configuration.maxScore
  const hasPassed = score >= minThreshold && score <= maxThreshold

  return { score, normalizedScore, metadata, hasPassed }
}

import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { scan } from 'promptl-ai'
import { z } from 'zod'
import { database } from '../../../client'
import {
  EvaluationType,
  LlmEvaluationCustomResultMetadata,
  LlmEvaluationMetric,
  LlmEvaluationCustomSpecification as specification,
} from '../../../constants'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { assembleTraceWithMessages } from '../../tracing/traces/assemble'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'
import { buildEvaluationParameters, runPrompt } from './shared'

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
  _ = database,
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
    configuration.minThreshold === undefined &&
    configuration.maxThreshold === undefined
  ) {
    return Result.error(
      new z.ZodError([
        {
          code: 'custom',
          path: ['threshold'],
          message: 'At least one threshold (minimum or maximum) is required',
        },
      ]),
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

function grade({
  score,
  metadata,
}: {
  score: number
  metadata: LlmEvaluationCustomResultMetadata
}) {
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

async function run(
  {
    resultUuid,
    evaluation,
    actualOutput,
    expectedOutput,
    datasetLabel,
    conversation,
    span,
    providers,
    commit,
    workspace,
  }: EvaluationMetricRunArgs<EvaluationType.Llm, LlmEvaluationMetric.Custom>,
  db = database,
) {
  // Note: expectedOutput is optional for this metric as this function
  // is reused for both, custom and custom labeled, llm metrics

  const metadata = {
    configuration: evaluation.configuration,
    actualOutput: actualOutput.value ?? '',
    expectedOutput: expectedOutput?.value,
    datasetLabel: datasetLabel,
    evaluationLogId: -1,
    reason: '',
    tokens: 0,
    cost: 0,
    duration: 0,
  } as LlmEvaluationCustomResultMetadata

  if (actualOutput.error) {
    metadata.reason = actualOutput.error.message
    return grade({ score: 0, metadata })
  }

  if (expectedOutput?.error) {
    throw expectedOutput.error
  }

  const provider = providers?.get(metadata.configuration.provider)
  if (!provider) {
    throw new BadRequestError('Provider is required')
  }

  const promptSchema = z.preprocess(
    aliasVerdict,
    z.object({
      score: z
        .int()
        .min(metadata.configuration.minScore)
        .max(metadata.configuration.maxScore),
      reason: z.string(),
    }),
  )

  const assembledTraceResult = await assembleTraceWithMessages(
    { traceId: span.traceId, workspace },
    db,
  )
  if (!Result.isOk(assembledTraceResult)) {
    return Result.error(new BadRequestError('Could not assemble trace'))
  }
  const { completionSpan } = assembledTraceResult.unwrap()

  let result
  try {
    result = await runPrompt({
      prompt: metadata.configuration.prompt,
      parameters: buildEvaluationParameters({
        span,
        completionSpan,
        actualOutput: metadata.actualOutput,
        conversation,
        expectedOutput: metadata.expectedOutput,
      }),
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
      Number(result.verdict.score.toFixed(0)),
      metadata.configuration.minScore,
    ),
    metadata.configuration.maxScore,
  )

  return grade({ score, metadata })
}

import { scan } from 'promptl-ai'
import { z } from 'zod'
import {
  ErrorableEntity,
  EvaluationType,
  formatConversation,
  LlmEvaluationMetric,
  LlmEvaluationCustomSpecification as specification,
} from '../../../browser'
import { database, Database } from '../../../client'
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { serialize as serializeDocumentLog } from '../../documentLogs/serialize'
import { createRunError } from '../../runErrors/create'
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
  // Note: we allow to save an invalid prompt to avoid bad
  // user experience when automatically saving the prompt

  if (configuration.prompt === undefined) {
    return Result.error(new BadRequestError('Prompt is required'))
  }

  try {
    const { config } = await scan({ prompt: configuration.prompt })
    configuration.provider = (config.provider as string | undefined) ?? ''
    configuration.model = (config.model as string | undefined) ?? ''
  } catch (_) {
    // Fail silently
  }

  if (
    configuration.minThreshold !== undefined &&
    (configuration.minThreshold < 0 || configuration.minThreshold > 100)
  ) {
    return Result.error(
      new BadRequestError(
        'Minimum threshold must be a number between 0 and 100',
      ),
    )
  }

  if (
    configuration.maxThreshold !== undefined &&
    (configuration.maxThreshold < 0 || configuration.maxThreshold > 100)
  ) {
    return Result.error(
      new BadRequestError(
        'Maximum threshold must be a number between 0 and 100',
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
    prompt: configuration.prompt,
    minThreshold: configuration.minThreshold,
    maxThreshold: configuration.maxThreshold,
  })
}

const promptSchema = z.object({
  score: z.number().min(0).max(100),
  reason: z.string(),
})

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
  try {
    let metadata = {
      configuration: evaluation.configuration,
      actualOutput: actualOutput,
      expectedOutput: expectedOutput,
      datasetLabel: datasetLabel,
      evaluationLogId: -1,
      reason: '',
      tokens: 0,
      cost: 0,
      duration: 0,
    }

    // Note: expectedOutput is optional for this metric

    const provider = providers?.get(metadata.configuration.provider)
    if (!provider) {
      throw new BadRequestError('Provider is required')
    }

    const evaluatedLog = await serializeDocumentLog(
      { documentLog, workspace },
      db,
    ).then((r) => r.unwrap())

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

    const score = Math.min(Math.max(Number(verdict.score.toFixed(0)), 0), 100)

    let normalizedScore = normalizeScore(score, 0, 100)
    if (metadata.configuration.reverseScale) {
      normalizedScore = normalizeScore(score, 100, 0)
    }

    const minThreshold = metadata.configuration.minThreshold ?? 0
    const maxThreshold = metadata.configuration.maxThreshold ?? 100
    const hasPassed = score >= minThreshold && score <= maxThreshold

    return { score, normalizedScore, metadata, hasPassed }
  } catch (error) {
    let runError
    if (error instanceof ChainError) {
      runError = await createRunError(
        {
          data: {
            errorableUuid: resultUuid,
            errorableType: ErrorableEntity.EvaluationResult,
            code: error.errorCode,
            message: error.message,
            details: error.details,
          },
        },
        db,
      ).then((r) => r.unwrap())
    }

    return {
      error: { message: (error as Error).message, runErrorId: runError?.id },
    }
  }
}

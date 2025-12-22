import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { z } from 'zod'
import { database } from '../../../client'
import {
  EvaluationType,
  LLM_EVALUATION_CUSTOM_PROMPT_DOCUMENTATION,
  LlmEvaluationBinaryResultMetadata,
  LlmEvaluationMetric,
  LlmEvaluationBinarySpecification as specification,
} from '../../../constants'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import {
  EvaluationMetricCloneArgs,
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'
import { buildEvaluationParameters, promptTask, runPrompt } from './shared'
import { assembleTrace } from '../../tracing/traces/assemble'
import { findCompletionSpanFromTrace } from '../../tracing/spans/fetching/findCompletionSpanFromTrace'

export const LlmEvaluationBinarySpecification = {
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
    LlmEvaluationMetric.Binary
  >,
  _ = database,
) {
  configuration.criteria = configuration.criteria.trim()
  if (!configuration.criteria) {
    return Result.error(new BadRequestError('Criteria is required'))
  }

  configuration.passDescription = configuration.passDescription.trim()
  if (!configuration.passDescription) {
    return Result.error(new BadRequestError('Pass description is required'))
  }

  configuration.failDescription = configuration.failDescription.trim()
  if (!configuration.failDescription) {
    return Result.error(new BadRequestError('Fail description is required'))
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
    passDescription: configuration.passDescription,
    failDescription: configuration.failDescription,
  })
}

export const promptSchema = z.object({
  passed: z.boolean(),
  reason: z.string(),
})

export function buildPrompt({
  provider,
  model,
  criteria,
  passDescription,
  failDescription,
}: {
  provider: ProviderApiKey
  model: string
  criteria: string
  passDescription: string
  failDescription: string
}) {
  return `
---
provider: ${provider.name}
model: ${model}
temperature: ${model.toLowerCase().startsWith('gpt-5') ? 1 : 0.7}
---

You're an expert LLM-as-a-judge evaluator. Your task is to judge whether the response, from another LLM model (the assistant), meets the following criteria:
${criteria}

The resulting verdict is \`true\` if the response meets the criteria, \`false\` otherwise, where:
- \`true\` represents "${passDescription}"
- \`false\` represents "${failDescription}"

${promptTask()}

You must give your verdict as a single JSON object with the following properties:
- passed (boolean): \`true\` if the response meets the criteria, \`false\` otherwise.
- reason (string): A string explaining your evaluation decision.
`.trim()
}

function grade({
  score,
  metadata,
}: {
  score: number
  metadata: LlmEvaluationBinaryResultMetadata
}) {
  let normalizedScore = normalizeScore(score, 0, 1)
  let hasPassed = score === 1
  if (metadata.configuration.reverseScale) {
    normalizedScore = normalizeScore(score, 1, 0)
    hasPassed = score === 0
  }

  return { score, normalizedScore, metadata, hasPassed }
}

async function run(
  {
    resultUuid,
    evaluation,
    actualOutput,
    conversation,
    span,
    providers,
    commit,
    workspace,
  }: EvaluationMetricRunArgs<EvaluationType.Llm, LlmEvaluationMetric.Binary>,
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
  } as LlmEvaluationBinaryResultMetadata

  if (actualOutput.error) {
    metadata.reason = actualOutput.error.message
    return grade({ score: 0, metadata })
  }

  const provider = providers?.get(metadata.configuration.provider)
  if (!provider) {
    throw new BadRequestError('Provider is required')
  }

  let completionSpan
  const assembledtrace = await assembleTrace(
    { traceId: span.traceId, workspace },
    db,
  ).then((r) => r.value)
  if (assembledtrace) {
    completionSpan = findCompletionSpanFromTrace(assembledtrace.trace)
  }

  let result
  try {
    result = await runPrompt({
      prompt: buildPrompt({ ...metadata.configuration, provider }),
      parameters: buildEvaluationParameters({
        span,
        completionSpan,
        actualOutput: metadata.actualOutput,
        conversation,
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

  const score = result.verdict.passed ? 1 : 0

  return grade({ score, metadata })
}

async function clone(
  {
    evaluation,
    providers,
  }: EvaluationMetricCloneArgs<EvaluationType.Llm, LlmEvaluationMetric.Binary>,
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
  This evaluation has been cloned. The verdict has been changed from "false" / "true" to "0" / "1". Feel free to modify the prompt.
*/
`.trim(),
      minScore: 0,
      maxScore: 1,
      minThreshold: evaluation.configuration.reverseScale ? undefined : 1,
      maxThreshold: evaluation.configuration.reverseScale ? 1 : undefined,
    },
  })
}

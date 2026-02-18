import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { z } from 'zod'
import { database } from '../../../client'
import {
  EvaluationType,
  LLM_EVALUATION_CUSTOM_PROMPT_DOCUMENTATION,
  LlmEvaluationComparisonResultMetadata,
  LlmEvaluationMetric,
  LlmEvaluationComparisonSpecification as specification,
} from '../../../constants'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { assembleTraceWithMessages } from '../../tracing/traces/assemble'
import {
  EvaluationMetricCloneArgs,
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'
import { buildEvaluationParameters, promptTask, runPrompt } from './shared'

export const LlmEvaluationComparisonSpecification = {
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
    LlmEvaluationMetric.Comparison
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
    actualOutput: configuration.actualOutput,
    expectedOutput: configuration.expectedOutput,
    provider: configuration.provider,
    model: configuration.model,
    criteria: configuration.criteria,
    passDescription: configuration.passDescription,
    failDescription: configuration.failDescription,
    minThreshold: configuration.minThreshold,
    maxThreshold: configuration.maxThreshold,
  })
}

const promptSchema = z.object({
  score: z.int().min(0).max(100),
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

You're an expert LLM-as-a-judge evaluator. Your task is to judge how well the response, from another LLM model (the assistant), compares to the expected output, following the criteria:
${criteria}

This is the expected output to compare against:
\`\`\`
{{ expectedOutput }}
\`\`\`

The resulting verdict is an integer number between \`0\`, if the response compares poorly to the expected output, and \`100\` otherwise, where:
- \`0\` represents "${failDescription}"
- \`100\` represents "${passDescription}"

${promptTask()}

Important: The verdict format below is YOUR output format as an evaluator. Do not factor it into your assessment of the assistant's response. The assistant being evaluated is not expected to produce a verdict or follow this format.

You must give your verdict as a single JSON object with the following properties:
- score (number): An integer number between \`0\` and \`100\`.
- reason (string): A string explaining your evaluation decision.
`.trim()
}

function grade({
  score,
  metadata,
}: {
  score: number
  metadata: LlmEvaluationComparisonResultMetadata
}) {
  let normalizedScore = normalizeScore(score, 0, 100)
  if (metadata.configuration.reverseScale) {
    normalizedScore = normalizeScore(score, 100, 0)
  }

  const minThreshold = metadata.configuration.minThreshold ?? 0
  const maxThreshold = metadata.configuration.maxThreshold ?? 100
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
  }: EvaluationMetricRunArgs<
    EvaluationType.Llm,
    LlmEvaluationMetric.Comparison
  >,
  db = database,
) {
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
  } as LlmEvaluationComparisonResultMetadata

  if (actualOutput.error) {
    metadata.reason = actualOutput.error.message
    return grade({ score: 0, metadata })
  }

  if (expectedOutput?.error) {
    throw expectedOutput.error
  } else if (metadata.expectedOutput === undefined) {
    throw new BadRequestError('Expected output is required')
  }

  const provider = providers?.get(metadata.configuration.provider)
  if (!provider) {
    throw new BadRequestError('Provider is required')
  }

  const assembledTraceResult = await assembleTraceWithMessages(
    { traceId: span.traceId, workspace, spanId: span.id },
    db,
  )
  if (!Result.isOk(assembledTraceResult)) {
    return Result.error(new BadRequestError('Could not assemble trace'))
  }
  const { completionSpan } = assembledTraceResult.unwrap()

  let result
  try {
    result = await runPrompt({
      prompt: buildPrompt({ ...metadata.configuration, provider }),
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

  metadata.reason = result.verdict.reason
  metadata.tokens = result.stats.tokens
  metadata.cost = result.stats.costInMillicents
  metadata.duration = result.stats.duration

  const score = Math.min(
    Math.max(Number(result.verdict.score.toFixed(0)), 0),
    100,
  )

  return grade({ score, metadata })
}

async function clone(
  {
    evaluation,
    providers,
  }: EvaluationMetricCloneArgs<
    EvaluationType.Llm,
    LlmEvaluationMetric.Comparison
  >,
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
    metric: LlmEvaluationMetric.CustomLabeled,
    configuration: {
      reverseScale: evaluation.configuration.reverseScale,
      actualOutput: evaluation.configuration.actualOutput,
      expectedOutput: evaluation.configuration.expectedOutput,
      provider: evaluation.configuration.provider,
      model: evaluation.configuration.model,
      prompt: `
${LLM_EVALUATION_CUSTOM_PROMPT_DOCUMENTATION}

${buildPrompt({ ...evaluation.configuration, provider })}
`.trim(),
      minScore: 0,
      maxScore: 100,
      minThreshold: evaluation.configuration.minThreshold,
      maxThreshold: evaluation.configuration.maxThreshold,
    },
  })
}

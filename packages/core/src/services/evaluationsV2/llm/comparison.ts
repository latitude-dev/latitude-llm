import { z } from 'zod'
import {
  EvaluationType,
  formatConversation,
  LLM_EVALUATION_CUSTOM_PROMPT_DOCUMENTATION,
  LlmEvaluationMetric,
  ProviderApiKey,
  LlmEvaluationComparisonSpecification as specification,
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
  _: Database = database,
) {
  if (!configuration.criteria) {
    return Result.error(new BadRequestError('Criteria is required'))
  }

  if (!configuration.passDescription) {
    return Result.error(new BadRequestError('Pass description is required'))
  }

  if (!configuration.failDescription) {
    return Result.error(new BadRequestError('Fail description is required'))
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
    criteria: configuration.criteria,
    passDescription: configuration.passDescription,
    failDescription: configuration.failDescription,
    minThreshold: configuration.minThreshold,
    maxThreshold: configuration.maxThreshold,
  })
}

const promptSchema = z.object({
  score: z.number().int().min(0).max(100),
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
temperature: 0.7
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

${promptTask({ provider })}

You must give your verdict as a single JSON object with the following properties:
- score (number): An integer number between \`0\` and \`100\`.
- reason (string): A string explaining your evaluation decision.
`.trim()
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
  }: EvaluationMetricRunArgs<
    EvaluationType.Llm,
    LlmEvaluationMetric.Comparison
  >,
  db: Database = database,
) {
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

  if (!metadata.expectedOutput) {
    throw new BadRequestError('Expected output is required')
  }

  const provider = providers?.get(metadata.configuration.provider)
  if (!provider) {
    throw new BadRequestError('Provider is required')
  }

  const evaluatedLog = await serializeDocumentLog(
    { documentLog, workspace },
    db,
  ).then((r) => r.unwrap())

  const { response, stats, verdict } = await runPrompt({
    prompt: buildPrompt({ ...metadata.configuration, provider }),
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
}

async function clone(
  {
    evaluation,
    providers,
  }: EvaluationMetricCloneArgs<
    EvaluationType.Llm,
    LlmEvaluationMetric.Comparison
  >,
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
    metric: LlmEvaluationMetric.CustomLabeled,
    configuration: {
      reverseScale: evaluation.configuration.reverseScale,
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

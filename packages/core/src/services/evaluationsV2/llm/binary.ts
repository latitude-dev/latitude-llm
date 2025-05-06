import { z } from 'zod'
import {
  EvaluationType,
  formatConversation,
  LLM_EVALUATION_CUSTOM_PROMPT_DOCUMENTATION,
  LlmEvaluationMetric,
  ProviderApiKey,
  LlmEvaluationBinarySpecification as specification,
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

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
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
temperature: 0.7
---

You're an expert LLM-as-a-judge evaluator. Your task is to judge whether the response, from another LLM model (the assistant), meets the following criteria:
${criteria}

The resulting verdict is \`true\` if the response meets the criteria, \`false\` otherwise, where:
- \`true\` represents "${passDescription}"
- \`false\` represents "${failDescription}"

${promptTask({ provider })}

You must give your verdict as a single JSON object with the following properties:
- passed (boolean): \`true\` if the response meets the criteria, \`false\` otherwise.
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
  }: EvaluationMetricRunArgs<EvaluationType.Llm, LlmEvaluationMetric.Binary>,
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

  const { response, stats, verdict } = await runPrompt({
    prompt: buildPrompt({ ...metadata.configuration, provider }),
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

  const score = verdict.passed ? 1 : 0

  let normalizedScore = normalizeScore(score, 0, 1)
  let hasPassed = score === 1
  if (metadata.configuration.reverseScale) {
    normalizedScore = normalizeScore(score, 1, 0)
    hasPassed = score === 0
  }

  return { score, normalizedScore, metadata, hasPassed }
}

async function clone(
  {
    evaluation,
    providers,
  }: EvaluationMetricCloneArgs<EvaluationType.Llm, LlmEvaluationMetric.Binary>,
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

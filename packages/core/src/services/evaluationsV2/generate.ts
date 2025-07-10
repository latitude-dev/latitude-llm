import { env } from '@latitude-data/env'
import { z } from 'zod'
import {
  CLOUD_MESSAGES,
  Commit,
  DocumentVersion,
  EvaluationSettings,
  EvaluationType,
  findFirstModelForProvider,
  LlmEvaluationMetric,
  Workspace,
} from '../../browser'
import { cache as getCache } from '../../cache'
import { database } from '../../client'
import { UnprocessableEntityError } from '../../lib/errors'
import { hashContent } from '../../lib/hashContent'
import { Result } from '../../lib/Result'
import { getCopilot, runCopilot } from '../copilot'
import { findDefaultEvaluationProvider } from '../providerApiKeys/findDefaultProvider'

const generatorSchema = z.object({
  name: z.string(),
  description: z.string(),
  reverseScale: z.boolean(),
  criteria: z.string(),
  minRatingDescription: z.string(),
  maxRatingDescription: z.string(),
})

const generatorKey = (document: DocumentVersion, instructions?: string) =>
  `evaluations:generator:${hashContent(document.content)}:${instructions}`

export async function generateEvaluationV2(
  {
    instructions,
    document,
    workspace,
  }: {
    instructions?: string
    document: DocumentVersion
    commit: Commit
    workspace: Workspace
  },
  db = database,
) {
  if (!env.LATITUDE_CLOUD) {
    return Result.error(new Error(CLOUD_MESSAGES.generateEvaluations))
  }

  if (!env.COPILOT_EVALUATION_GENERATOR_PROMPT_PATH) {
    return Result.error(
      new Error('COPILOT_EVALUATION_GENERATOR_PROMPT_PATH is not set'),
    )
  }

  const copilot = await getCopilot(
    { path: env.COPILOT_EVALUATION_GENERATOR_PROMPT_PATH },
    db,
  ).then((r) => r.unwrap())

  let settings:
    | EvaluationSettings<EvaluationType.Llm, LlmEvaluationMetric.Rating>
    | undefined

  const cache = await getCache()
  try {
    const key = generatorKey(document, instructions)
    const item = await cache.get(key)
    if (item) settings = JSON.parse(item)
  } catch (_) {
    // Note: doing nothing
  }
  if (settings) return Result.ok({ settings })

  const provider = await findDefaultEvaluationProvider(workspace, db).then(
    (r) => r.unwrap(),
  )
  if (!provider) {
    return Result.error(
      new UnprocessableEntityError('No provider for evaluations available'),
    )
  }

  const model = findFirstModelForProvider({
    provider: provider,
    defaultProviderName: env.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
  })
  if (!model) {
    return Result.error(
      new UnprocessableEntityError('No model for evaluations available'),
    )
  }

  const result = await runCopilot({
    copilot: copilot,
    parameters: {
      instructions: instructions ?? '',
      prompt: document.content,
    },
    schema: generatorSchema,
  }).then((r) => r.unwrap())

  settings = {
    name: result.name,
    description: result.description,
    type: EvaluationType.Llm,
    metric: LlmEvaluationMetric.Rating,
    configuration: {
      reverseScale: result.reverseScale,
      actualOutput: {
        messageSelection: 'last',
        parsingFormat: 'string',
      },
      expectedOutput: {
        parsingFormat: 'string',
      },
      provider: provider.name,
      model: model,
      criteria: result.criteria,
      minRating: 1,
      minRatingDescription: result.minRatingDescription,
      maxRating: 5,
      maxRatingDescription: result.maxRatingDescription,
      minThreshold: 3,
    },
  }

  try {
    const key = generatorKey(document, instructions)
    const item = JSON.stringify(settings)
    await cache.set(key, item)
  } catch (_) {
    // Note: doing nothing
  }

  return Result.ok({ settings })
}

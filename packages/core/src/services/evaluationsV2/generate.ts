import { env } from '@latitude-data/env'
import { z } from 'zod'
import { cache as getCache } from '../../cache'
import { database } from '../../client'
import {
  CLOUD_MESSAGES,
  DEFAULT_EVALUATION_TRIGGER_SETTINGS,
  EvaluationSettings,
  EvaluationType,
  LlmEvaluationMetric,
} from '../../constants'
import { UnprocessableEntityError } from '../../lib/errors'
import { hashContent } from '../../lib/hashContent'
import { Result } from '../../lib/Result'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { findFirstModelForProvider } from '../ai/providers/models'
import { runCopilot } from '../copilot'
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
  `evaluations:generator:${hashContent(document.content + (instructions ?? ''))}`

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

  if (!env.COPILOT_PROMPT_EVALUATION_GENERATOR_V2_PATH) {
    return Result.error(
      new Error('COPILOT_PROMPT_EVALUATION_GENERATOR_V2_PATH is not set'),
    )
  }

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
    path: env.COPILOT_PROMPT_EVALUATION_GENERATOR_V2_PATH,
    parameters: {
      instructions: instructions ?? '',
      prompt: document.content,
    },
    schema: generatorSchema,
    db,
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
      trigger: DEFAULT_EVALUATION_TRIGGER_SETTINGS,
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

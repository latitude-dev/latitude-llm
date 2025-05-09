import { env } from '@latitude-data/env'
import {
  EvaluationType,
  LlmEvaluationMetric,
  Workspace,
  type Commit,
  type DocumentVersion,
  findFirstModelForProvider,
} from '../../browser'
import { createEvaluationV2 } from './create'
import { database } from '../../client'
import { findDefaultEvaluationProvider } from '../providerApiKeys/findDefaultProvider'
import { Result } from '../../lib/Result'

export async function createDemoEvaluation(
  {
    commit,
    document,
    workspace,
  }: {
    commit: Commit
    document: DocumentVersion
    workspace: Workspace
  },
  db = database,
) {
  // Note: failing silently to avoid not letting the user create the document
  const result = await findDefaultEvaluationProvider(workspace!, db)
  if (result.error || !result.value) return Result.nil()
  const provider = result.value

  const model = findFirstModelForProvider({
    provider,
    defaultProviderName: env.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
  })

  if (!model) return Result.nil()

  return await createEvaluationV2(
    {
      document,
      commit,
      settings: {
        name: 'Accuracy',
        description: `Evaluates how well the given instructions are followed.`,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Rating,
        configuration: {
          reverseScale: false,
          provider: provider.name,
          model: model,
          criteria:
            'Assess how well the response follows the given instructions.',
          minRating: 1,
          minRatingDescription:
            "Not faithful, doesn't follow the instructions.",
          maxRating: 5,
          maxRatingDescription: 'Very faithful, does follow the instructions.',
          minThreshold: 4,
        },
      },
      options: {
        evaluateLiveLogs: true,
        enableSuggestions: true,
        autoApplySuggestions: true,
      },
      workspace,
    },
    db,
  )
}

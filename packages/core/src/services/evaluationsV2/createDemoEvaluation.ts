import { env } from '@latitude-data/env'
import {
  Commit,
  DocumentVersion,
  EvaluationType,
  findFirstModelForProvider,
  HumanEvaluationMetric,
  LlmEvaluationMetric,
  Workspace,
} from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { findDefaultEvaluationProvider } from '../providerApiKeys/findDefaultProvider'
import { createEvaluationV2 } from './create'

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
  transaction = new Transaction(),
) {
  return transaction.call(async (trx) => {
    // Note: failing silently to avoid not letting the user create the document
    const result = await findDefaultEvaluationProvider(workspace!, trx)
    if (result.error) return Result.nil()
    const provider = result.value
    if (!provider) return Result.nil()

    const model = findFirstModelForProvider({
      provider,
      defaultProviderName: env.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
    })
    if (!model) return Result.nil()

    const creatinga = await createEvaluationV2(
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
            actualOutput: {
              messageSelection: 'last',
              parsingFormat: 'string',
            },
            expectedOutput: {
              parsingFormat: 'string',
            },
            provider: provider.name,
            model: model,
            criteria:
              'Assess how well the response follows the given instructions.',
            minRating: 1,
            minRatingDescription:
              "Not faithful, doesn't follow the instructions.",
            maxRating: 5,
            maxRatingDescription:
              'Very faithful, does follow the instructions.',
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
      transaction,
    )
    if (creatinga.error) return Result.nil()
    const accuracy = creatinga.value.evaluation

    const creatingf = await createEvaluationV2(
      {
        document,
        commit,
        settings: {
          name: 'Feedback',
          description: `Evaluates how well the expected behavior is followed.`,
          type: EvaluationType.Human,
          metric: HumanEvaluationMetric.Rating,
          configuration: {
            reverseScale: false,
            actualOutput: {
              messageSelection: 'last',
              parsingFormat: 'string',
            },
            expectedOutput: {
              parsingFormat: 'string',
            },
            criteria:
              'Assess how well the response follows the expected behavior.',
            minRating: 1,
            minRatingDescription:
              "Poor response, doesn't follow the instructions.",
            maxRating: 5,
            maxRatingDescription:
              'Perfect response, does follow the instructions.',
            minThreshold: 4,
          },
        },
        options: {
          evaluateLiveLogs: false,
          enableSuggestions: true,
          autoApplySuggestions: true,
        },
        workspace,
      },
      transaction,
    )
    if (creatingf.error) return Result.nil()
    const feedback = creatingf.value.evaluation

    return Result.ok({ accuracy, feedback })
  })
}

import { env } from '@latitude-data/env'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { EvaluationType, HumanEvaluationMetric } from '../../constants'
import { findFirstModelForProvider } from '../ai/providers/models'
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

    const creatingf = await createEvaluationV2(
      {
        document,
        commit,
        settings: {
          name: 'Human Annotation',
          description: `Evaluates how well the expected behavior is followed`,
          type: EvaluationType.Human,
          metric: HumanEvaluationMetric.Binary,
          configuration: {
            reverseScale: false,
            actualOutput: {
              messageSelection: 'last',
              parsingFormat: 'string',
            },
            expectedOutput: {
              parsingFormat: 'string',
            },
            enableControls: true,
            criteria:
              'Assess how well the response follows the expected behavior.',
            passDescription: 'Perfect response, does follow the instructions.',
            failDescription: "Poor response, doesn't follow the instructions.",
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

    return Result.ok({ feedback })
  })
}

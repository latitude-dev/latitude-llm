import type { ExperimentVariant } from '@latitude-data/constants/experiments'
import { scan } from 'promptl-ai'
import {
  Commit,
  Dataset,
  DocumentVersion,
  EvaluationV2,
  Experiment,
  User,
  Workspace,
} from '../../browser'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { NotFoundError } from '../../lib/errors'
import { ProviderApiKeysRepository } from '../../repositories'
import { createExperiment } from './create'

export async function createExperimentVariants(
  {
    workspace,
    user,
    commit,
    document,
    variants: inputVariants,
    evaluations,
    dataset,
    parametersMap,
    datasetLabels,
    fromRow = 0,
    toRow,
  }: {
    user: User
    workspace: Workspace
    commit: Commit
    variants: ExperimentVariant[]
    evaluations: EvaluationV2[]
    document: DocumentVersion
    dataset?: Dataset
    parametersMap: Record<string, number>
    datasetLabels: Record<string, string>
    fromRow?: number
    toRow?: number
  },
  transaction = new Transaction(),
) {
  return transaction.call<Experiment[]>(async (tx) => {
    const providersScope = new ProviderApiKeysRepository(workspace.id, tx)
    const providers = await providersScope.findAll().then((r) => r.unwrap())
    const nonExistingProvider = inputVariants.find(
      (variant) =>
        !providers.some((provider) => provider.name === variant.provider),
    )

    if (nonExistingProvider) {
      return Result.error(
        new NotFoundError(
          `The provider '${nonExistingProvider.provider}' was not found in your workspace`,
        ),
      )
    }

    const originalPrompt = document.content
    // I'll assume everyone uses promptl by now
    const { config: originalConfig, setConfig } = await scan({
      prompt: originalPrompt,
    })

    const experiments = await Promise.all(
      inputVariants.map(async (variant) => {
        const variantPrompt = setConfig({
          ...originalConfig,
          provider: variant.provider,
          model: variant.model,
          temperature: variant.temperature,
        })

        return await createExperiment(
          {
            name: variant.name,
            customPrompt: variantPrompt,
            document,
            commit,
            evaluations,
            dataset,
            parametersMap,
            datasetLabels,
            fromRow,
            toRow,
            workspace,
          },
          transaction,
        ).then((r) => r.unwrap())
      }),
    )

    publisher.publishLater({
      type: 'experimentVariantsCreated',
      data: {
        userEmail: user.email,
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        variants: inputVariants,
      },
    })

    return Result.ok(experiments as Experiment[])
  })
}

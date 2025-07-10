import type { ExperimentVariant } from '@latitude-data/constants/experiments'
import { Dataset, Experiment, User } from '../../browser'
import { Commit, DocumentVersion, EvaluationV2, Workspace } from '../../browser'
import { database } from '../../client'
import { ProviderApiKeysRepository } from '../../repositories'
import Transaction from '../../lib/Transaction'
import { Result } from '../../lib/Result'
import { NotFoundError } from '../../lib/errors'
import { scan } from 'promptl-ai'
import { createExperiment } from './create'
import { publisher } from '../../events/publisher'

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
  db = database,
) {
  const providersScope = new ProviderApiKeysRepository(workspace.id, db)
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

  return Transaction.call<Experiment[]>(async (tx) => {
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
          tx,
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
  }, db)
}

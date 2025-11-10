import type { ExperimentVariant } from '@latitude-data/constants/experiments'
import { scan } from 'promptl-ai'
import { EvaluationV2 } from '../../constants'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { NotFoundError } from '../../lib/errors'
import { ProviderApiKeysRepository } from '../../repositories'
import { type Commit } from '../../schema/models/types/Commit'
import { type Dataset } from '../../schema/models/types/Dataset'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Experiment } from '../../schema/models/types/Experiment'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { createExperiment } from './create'
import { SimulationSettings } from '@latitude-data/constants/simulation'
import type {
  ExperimentDatasetSource,
  ExperimentLogsSource,
  ExperimentManualSource,
} from '@latitude-data/constants/experiments'

// Input type for createVariants - includes Dataset object (resolved from datasetId by caller)
type CreateExperimentVariantsInput =
  | (Omit<ExperimentDatasetSource, 'datasetId'> & { dataset: Dataset })
  | ExperimentLogsSource
  | ExperimentManualSource

export async function createExperimentVariants(
  {
    workspace,
    user,
    commit,
    document,
    variants: inputVariants,
    evaluations,
    parametersPopulation,
    simulationSettings,
  }: {
    user: User
    workspace: Workspace
    commit: Commit
    variants: ExperimentVariant[]
    evaluations: EvaluationV2[]
    document: DocumentVersion
    parametersPopulation: CreateExperimentVariantsInput
    simulationSettings: SimulationSettings
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
            parametersPopulation,
            workspace,
            simulationSettings,
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

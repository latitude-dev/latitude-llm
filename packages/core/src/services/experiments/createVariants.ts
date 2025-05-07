import { Dataset, Experiment } from '../../browser'
import { Commit, DocumentVersion, EvaluationV2, Workspace } from '../../browser'
import { database, Database } from '../../client'
import { ProviderApiKeysRepository } from '../../repositories'
import { PromisedResult } from '../../lib/Transaction'
import { Result } from '../../lib/Result'
import { LatitudeError, NotFoundError } from '../../lib/errors'
import { scan } from 'promptl-ai'
import { createExperiment } from './create'

export async function createExperimentVariants(
  {
    workspace,
    commit,
    document,
    variants,
    evaluations,
    dataset,
    parametersMap,
    datasetLabels,
    fromRow = 0,
    toRow,
  }: {
    workspace: Workspace
    commit: Commit
    variants: {
      name: string
      provider: string
      model: string
      temperature: number
    }[]
    evaluations: EvaluationV2[]
    document: DocumentVersion
    dataset?: Dataset
    parametersMap: Record<string, number>
    datasetLabels: Record<string, string>
    fromRow?: number
    toRow?: number
  },
  db: Database = database,
): PromisedResult<Experiment[], LatitudeError> {
  const providersScope = new ProviderApiKeysRepository(workspace.id, db)
  const providers = await providersScope.findAll().then((r) => r.unwrap())
  const nonExistingProvider = variants.find(
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

  try {
    const experiments = await Promise.all(
      variants.map((variant) => {
        const variantPrompt = setConfig({
          ...originalConfig,
          provider: variant.provider,
          model: variant.model,
          temperature: variant.temperature,
        })

        return createExperiment(
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
          db,
        ).then((r) => r.unwrap())
      }),
    )

    return Result.ok(experiments)
  } catch (err) {
    const error = err as LatitudeError
    return Result.error(error)
  }
}

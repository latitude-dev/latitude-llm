import { MissingModelError, UnknownModelError } from '../errors'
import {
  findModelsDevModel,
  findModelsDevProvider,
  getModelsDevData,
  type ModelsDevProvider,
  type ModelsDevRawModel,
} from './modelsDev'

export type ResolvedModel = {
  providerId: string
  modelId: string
  modelName: string
  provider: ModelsDevProvider
  model: ModelsDevRawModel
}

/** Parses a <provider>/<model> string into its parts. */
export function parseModelId(modelId?: string): {
  providerId: string
  modelName: string
} {
  if (!modelId) {
    throw new MissingModelError('Model is required')
  }

  const [providerId, ...rest] = modelId.split('/')
  const modelName = rest.join('/')

  if (!providerId || !modelName) {
    throw new MissingModelError('Model must be in <provider>/<model> format')
  }

  return { providerId, modelName }
}

/** Resolves a model using models.dev data. */
export async function resolveModel(modelId?: string): Promise<ResolvedModel> {
  const { providerId, modelName } = parseModelId(modelId)
  const data = await getModelsDevData()
  const provider = findModelsDevProvider(data, providerId)

  if (!provider) {
    throw new UnknownModelError(`Unknown provider '${providerId}'`)
  }

  const model = findModelsDevModel(provider, modelName)
  if (!model) {
    throw new UnknownModelError(
      `Unknown model '${modelName}' for provider '${providerId}'`,
    )
  }

  return {
    providerId,
    modelId: `${providerId}/${modelName}`,
    modelName,
    provider,
    model,
  }
}

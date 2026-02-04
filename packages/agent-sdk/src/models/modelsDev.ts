export type ModelsDevProvider = {
  id: string
  env?: string[]
  npm?: string
  api?: string
  name?: string
  models?: Record<string, ModelsDevRawModel>
}

export type ModelsDevRawModel = {
  id: string
  name: string
}

export type ModelsDevData = Record<string, ModelsDevProvider>

const MODELS_DEV_API_URL = 'https://models.dev/api.json'

let cachedModelsDevData: ModelsDevData | undefined

/** Fetches and caches models.dev provider data. */
export async function getModelsDevData(): Promise<ModelsDevData> {
  if (cachedModelsDevData) return cachedModelsDevData

  const response = await fetch(MODELS_DEV_API_URL)
  if (!response.ok) {
    throw new Error('Failed to fetch models.dev data')
  }

  cachedModelsDevData = (await response.json()) as ModelsDevData
  return cachedModelsDevData
}

/** Finds a provider by id (case-insensitive). */
export function findModelsDevProvider(
  data: ModelsDevData,
  providerId: string,
): ModelsDevProvider | undefined {
  const key = providerId.toLowerCase()
  return Object.values(data).find(
    (provider) => provider.id.toLowerCase() === key,
  )
}

/** Finds a model by id within a provider (case-insensitive). */
export function findModelsDevModel(
  provider: ModelsDevProvider,
  modelId: string,
): ModelsDevRawModel | undefined {
  const models = provider.models ?? {}
  const key = modelId.toLowerCase()

  return Object.values(models).find((model) => model.id.toLowerCase() === key)
}

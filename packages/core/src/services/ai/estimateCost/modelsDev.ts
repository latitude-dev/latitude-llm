// Import bundled models.dev data
import modelsDevJson from '../../../assets/models.dev.json'

export type ModelsDevModel = {
  id: string
  name: string
  provider: string
  pricing?: {
    input?: number
    output?: number
  }
}

/**
 * Converts the bundled models.dev JSON to flattened model array
 * The bundled JSON has structure: { provider: { id: {..., models: { modelId: {...} } } } }
 */
function parseBundledModelsDevData(data: unknown): ModelsDevModel[] {
  const models: ModelsDevModel[] = []
  const providers = data as Record<
    string,
    {
      id: string
      name: string
      models?: Record<
        string,
        {
          id: string
          name: string
          cost?: Record<string, unknown>
        }
      >
    }
  >

  for (const providerId in providers) {
    const provider = providers[providerId]
    if (!provider.models) continue

    for (const modelId in provider.models) {
      const model = provider.models[modelId]
      const cost = model.cost as Record<string, unknown>

      models.push({
        id: model.id,
        name: model.name,
        provider: providerId,
        pricing:
          cost &&
          typeof cost === 'object' &&
          'input' in cost &&
          'output' in cost
            ? {
                input: cost.input as number,
                output: cost.output as number,
              }
            : undefined,
      })
    }
  }

  return models
}

/**
 * Gets bundled models.dev data (from the JSON file)
 * Always uses the local bundled data, no network calls
 */
export function getBundledModelsDevData(): ModelsDevModel[] {
  return parseBundledModelsDevData(modelsDevJson)
}

/**
 * Finds a model in the models.dev data by ID
 * The model ID is the Vercel AI SDK identifier
 */
export function findModelsDevModel(
  models: ModelsDevModel[],
  modelId: string,
): ModelsDevModel | undefined {
  return models.find((m) => m.id.toLowerCase() === modelId.toLowerCase())
}

/**
 * Gets pricing from a models.dev model entry
 * Returns null if pricing is not available
 */
export function getModelsDevPricing(
  model: ModelsDevModel,
): { input: number; output: number } | null {
  if (!model.pricing || !model.pricing.input || !model.pricing.output) {
    return null
  }

  return {
    input: model.pricing.input,
    output: model.pricing.output,
  }
}

/**
 * Gets all available models for a specific provider from bundled data
 * Always uses local bundled data, no network calls
 */
export function getModelsDevForProvider(
  providerName: string,
): ModelsDevModel[] {
  const modelsData = getBundledModelsDevData()

  return modelsData.filter(
    (m) => m.provider.toLowerCase() === providerName.toLowerCase(),
  )
}

// Import bundled models.dev data
import modelsDevJson from '../../../assets/models.dev.json'

export type ModelModality = 'text' | 'image' | 'audio' | 'video' | 'pdf'

export type ModelModalities = {
  input: ModelModality[]
  output: ModelModality[]
}

export type ModelsDevModel = {
  id: string
  name: string
  provider: string

  // Features
  toolCall?: boolean
  reasoning?: boolean
  attachment?: boolean
  supportsTemperature?: boolean
  structuredOutput?: boolean

  // Dates
  knowledgeCutoff?: string // e.g., "2024-09-30"
  releaseDate?: string

  // Modalities
  modalities?: ModelModalities

  // Limits
  contextLimit?: number // e.g., 400000
  outputLimit?: number // e.g., 128000

  // Open weights
  openWeights?: boolean

  // Pricing (per 1M tokens)
  pricing?: {
    input?: number
    output?: number
    cacheRead?: number
  }
}

/**
 * Raw model type as it appears in the models.dev JSON
 */
type RawModelsDevModel = {
  id: string
  name: string
  attachment?: boolean
  reasoning?: boolean
  tool_call?: boolean
  structured_output?: boolean
  temperature?: boolean
  knowledge?: string
  release_date?: string
  last_updated?: string
  modalities?: ModelModalities
  open_weights?: boolean
  cost?: {
    input?: number
    output?: number
    cache_read?: number
  }
  limit?: {
    context?: number
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
      models?: Record<string, RawModelsDevModel>
    }
  >

  for (const providerId in providers) {
    const provider = providers[providerId]
    if (!provider.models) continue

    for (const modelId in provider.models) {
      const model = provider.models[modelId]
      const cost = model.cost
      const limit = model.limit

      models.push({
        id: model.id,
        name: model.name,
        provider: providerId,

        // Features
        toolCall: model.tool_call,
        reasoning: model.reasoning,
        structuredOutput: model.structured_output,
        attachment: model.attachment,
        supportsTemperature: model.temperature,

        // Dates
        knowledgeCutoff: model.knowledge,
        releaseDate: model.release_date,

        // Modalities
        modalities: model.modalities,

        // Limits
        contextLimit: limit?.context,
        outputLimit: limit?.output,

        // Open weights
        openWeights: model.open_weights,

        // Pricing
        pricing:
          cost &&
          typeof cost === 'object' &&
          'input' in cost &&
          'output' in cost
            ? {
                input: cost.input,
                output: cost.output,
                cacheRead: cost.cache_read,
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

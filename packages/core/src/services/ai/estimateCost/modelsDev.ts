// Import bundled models.dev data
import { formatCount } from '@latitude-data/constants/formatCount'
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
    reasoning?: number
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
    reasoning?: number
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
                reasoning: cost.reasoning,
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
  // TODO: Let's add a singleton here, no need to re-read and re-parse the whole JSON file every time
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
 * Finds a model by id with best-match fallback: exact match first, then longest
 * prefix match so that requestedModel.startsWith(candidate.id).
 * The matched model id must not be longer than the passed model (so e.g. passing
 * "gpt" does not match "gpt-4" / "gpt-5" in the DB).
 *
 * @param models - List of models to search (must already be filtered by provider)
 */
export function findModelsDevModelWithFallback(
  models: ModelsDevModel[],
  modelId: string,
): ModelsDevModel | undefined {
  const requested = modelId.trim().toLowerCase()
  if (!requested) return undefined

  const exact = findModelsDevModel(models, modelId)
  if (exact) return exact

  const prefixMatches = models.filter(
    (m) =>
      requested.length >= m.id.length &&
      requested.startsWith(m.id.toLowerCase()),
  )
  if (prefixMatches.length === 0) return undefined

  return prefixMatches.reduce((best, m) =>
    m.id.length > (best?.id.length ?? 0) ? m : best,
  )
}

/**
 * Gets pricing from a models.dev model entry
 * Returns null if pricing is not available
 */
export function getModelsDevPricing(model: ModelsDevModel): {
  input: number
  output: number
  reasoning?: number
  cacheRead?: number
} | null {
  if (!model.pricing || !model.pricing.input || !model.pricing.output) {
    return null
  }

  return {
    input: model.pricing.input,
    output: model.pricing.output,
    reasoning: model.pricing.reasoning,
    cacheRead: model.pricing.cacheRead,
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

export function getModelsDevForModel(
  provider: string,
  model: string,
): ModelsDevModel | undefined {
  const models = getModelsDevForProvider(provider)
  return models.find((m) => m.id.toLowerCase() === model.toLowerCase())
}

export function formatModelsDevModel(model: ModelsDevModel) {
  const lines: string[] = [`${model.name} (${model.id})`]

  if (model.modalities) {
    const input = model.modalities.input?.join(', ')
    const output = model.modalities.output?.join(', ')
    if (input) lines.push(`Input modalities: ${input}`)
    if (output) lines.push(`Output modalities: ${output}`)
  }

  const features: string[] = []
  if (model.supportsTemperature) features.push('temperature')
  else lines.push('Temperature not supported')
  if (model.toolCall) features.push('tool calling')
  if (model.reasoning) features.push('reasoning')
  if (model.structuredOutput) features.push('structured output')
  if (model.attachment) features.push('attachments')
  if (features.length) lines.push(`Supported features: ${features.join(', ')}`)

  if (model.contextLimit || model.outputLimit) {
    const parts: string[] = []
    if (model.contextLimit) parts.push(`input: ${formatCount(model.contextLimit)}`) // prettier-ignore
    if (model.outputLimit) parts.push(`output: ${formatCount(model.outputLimit)}`) // prettier-ignore
    if (parts.length) lines.push(`Context window: ${parts.join(', ')}`)
  }

  if (model.pricing) {
    const parts: string[] = []
    if (model.pricing.input !== undefined) parts.push(`input: ${formatPrice(model.pricing.input)}`) // prettier-ignore
    if (model.pricing.output !== undefined) parts.push(`output: ${formatPrice(model.pricing.output)}`) // prettier-ignore
    if (model.pricing.cacheRead !== undefined) parts.push(`cached: ${formatPrice(model.pricing.cacheRead)}`) // prettier-ignore
    if (parts.length) lines.push(`Pricing (per 1M tokens): ${parts.join(', ')}`)
  }

  if (model.knowledgeCutoff) lines.push(`Knowledge cutoff: ${model.knowledgeCutoff}`) // prettier-ignore

  return lines.join('\n')
}

function formatPrice(price: number): string {
  if (price === 0) return '$0'
  if (price < 0.01) return `$${price.toFixed(3)}`
  return `$${price.toFixed(2)}`
}

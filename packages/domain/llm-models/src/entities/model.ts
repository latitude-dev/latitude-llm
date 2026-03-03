/**
 * LLM model information sourced from models.dev.
 *
 * Represents a language model with its capabilities, limits, and pricing.
 * The data is sourced from the bundled models.dev JSON and provides
 * standardized model metadata across providers.
 */

export type ModelModality = "text" | "image" | "audio" | "video" | "pdf"

export type ModelModalities = {
  readonly input: ModelModality[]
  readonly output: ModelModality[]
}

export type ModelPricing = {
  readonly input: number
  readonly output: number
  readonly cacheRead?: number | undefined
  readonly reasoning?: number | undefined
}

export type LlmModel = {
  readonly id: string
  readonly name: string
  readonly provider: string
  readonly toolCall?: boolean | undefined
  readonly reasoning?: boolean | undefined
  readonly attachment?: boolean | undefined
  readonly supportsTemperature?: boolean | undefined
  readonly structuredOutput?: boolean | undefined
  readonly knowledgeCutoff?: string | undefined
  readonly releaseDate?: string | undefined
  readonly modalities?: ModelModalities | undefined
  readonly contextLimit?: number | undefined
  readonly outputLimit?: number | undefined
  readonly openWeights?: boolean | undefined
  readonly pricing?: ModelPricing | undefined
}

type RawModel = {
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

type RawProvider = {
  id: string
  name: string
  models?: Record<string, RawModel>
}

type RawModelsDevData = Record<string, RawProvider>

function hasValidCost(
  cost: RawModel["cost"],
): cost is { input: number; output: number; cache_read?: number; reasoning?: number } {
  return cost !== undefined && typeof cost === "object" && "input" in cost && "output" in cost
}

/**
 * Parse raw models.dev JSON data into a flat array of LlmModel entries.
 *
 * The raw JSON has the structure:
 * `{ providerId: { id, name, models: { modelId: { ... } } } }`
 */
export function parseModelsDevData(data: unknown): LlmModel[] {
  const providers = data as RawModelsDevData
  const models: LlmModel[] = []

  for (const providerId in providers) {
    const provider = providers[providerId]
    if (!provider?.models) continue

    for (const modelId in provider.models) {
      const raw = provider.models[modelId]
      if (!raw) continue

      models.push({
        id: raw.id,
        name: raw.name,
        provider: providerId,
        toolCall: raw.tool_call,
        reasoning: raw.reasoning,
        structuredOutput: raw.structured_output,
        attachment: raw.attachment,
        supportsTemperature: raw.temperature,
        knowledgeCutoff: raw.knowledge,
        releaseDate: raw.release_date,
        modalities: raw.modalities,
        contextLimit: raw.limit?.context,
        outputLimit: raw.limit?.output,
        openWeights: raw.open_weights,
        pricing: hasValidCost(raw.cost)
          ? {
              input: raw.cost.input,
              output: raw.cost.output,
              cacheRead: raw.cost.cache_read,
              reasoning: raw.cost.reasoning,
            }
          : undefined,
      })
    }
  }

  return models
}

/**
 * LLM model information sourced from models.dev.
 *
 * Represents a language model with its capabilities, limits, and pricing.
 * The data is sourced from the bundled models.dev JSON and provides
 * standardized model metadata across providers.
 */

import { z } from "zod"

export const modelModalitySchema = z.enum(["text", "image", "audio", "video", "pdf"])
export type ModelModality = z.infer<typeof modelModalitySchema>

export const modelModalitiesSchema = z.object({
  input: z.array(modelModalitySchema),
  output: z.array(modelModalitySchema),
})
export type ModelModalities = z.infer<typeof modelModalitiesSchema>

export const modelPricingSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number().optional(),
  cacheWrite: z.number().optional(),
  reasoning: z.number().optional(),
})
export type ModelPricing = z.infer<typeof modelPricingSchema>

export const modelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  toolCall: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  attachment: z.boolean().optional(),
  supportsTemperature: z.boolean().optional(),
  structuredOutput: z.boolean().optional(),
  knowledgeCutoff: z.string().optional(),
  releaseDate: z.string().optional(),
  modalities: modelModalitiesSchema.optional(),
  contextLimit: z.number().optional(),
  outputLimit: z.number().optional(),
  openWeights: z.boolean().optional(),
  pricing: modelPricingSchema.optional(),
})
export type Model = z.infer<typeof modelSchema>

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
    cache_write?: number
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

const isRawModel = (value: unknown): value is RawModel => {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, "id") === "string"
}

const isRawProvider = (value: unknown): value is RawProvider => {
  if (typeof value !== "object" || value === null) {
    return false
  }

  const id = Reflect.get(value, "id")
  const name = Reflect.get(value, "name")
  const models = Reflect.get(value, "models")

  return (
    typeof id === "string" &&
    typeof name === "string" &&
    (models === undefined || (typeof models === "object" && models !== null))
  )
}

const isRawModelsDevData = (value: unknown): value is RawModelsDevData => {
  if (typeof value !== "object" || value === null) {
    return false
  }

  return Object.values(value).every(isRawProvider)
}

function hasValidCost(
  cost: RawModel["cost"],
): cost is { input: number; output: number; cache_read?: number; cache_write?: number; reasoning?: number } {
  return cost !== undefined && typeof cost === "object" && "input" in cost && "output" in cost
}

/**
 * Parse raw models.dev JSON data into a flat array of Model entries.
 *
 * The raw JSON has the structure:
 * `{ providerId: { id, name, models: { modelId: { ... } } } }`
 */
export function parseModelsDevData(data: unknown): Model[] {
  if (!isRawModelsDevData(data)) {
    return []
  }

  const providers = data
  const models: Model[] = []

  for (const providerId in providers) {
    const provider = providers[providerId]
    if (!provider?.models) continue

    for (const modelId in provider.models) {
      const raw = provider.models[modelId]
      if (!isRawModel(raw)) continue

      const candidate = {
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
              cacheWrite: raw.cost.cache_write,
              reasoning: raw.cost.reasoning,
            }
          : undefined,
      }

      const parsed = modelSchema.safeParse(candidate)
      if (parsed.success) {
        models.push(parsed.data)
      }
    }
  }

  return models
}

import { formatCount, formatPrice } from "@repo/utils"
import type { Model, ModelPricing } from "../entities/model.ts"

/**
 * Find a model by ID (case-insensitive) with prefix fallback.
 *
 * First tries an exact match; if none is found, falls back to the
 * model whose ID is the longest prefix of the requested `modelId`.
 * Useful for versioned model names like `gpt-4.1-2025-04-14` matching `gpt-4.1`.
 */
export function findModel(models: Model[], modelId: string): Model | undefined {
  const needle = modelId.toLowerCase()

  const exact = models.find((m) => m.id.toLowerCase() === needle)
  if (exact) return exact

  let best: Model | undefined
  let bestLen = 0

  for (const m of models) {
    const id = m.id.toLowerCase()
    if (needle.startsWith(id) && id.length > bestLen) {
      best = m
      bestLen = id.length
    }
  }

  return best
}

/**
 * Get the pricing for a model, or null if unavailable.
 */
export function getModelPricing(model: Model): ModelPricing | null {
  if (!model.pricing?.input || !model.pricing?.output) return null
  return model.pricing
}

/**
 * Format a model into a human-readable summary string.
 *
 * Includes name, modalities, features, context window, pricing,
 * and knowledge cutoff when available.
 */
export function formatModel(model: Model): string {
  const lines: string[] = [`${model.name} (${model.id})`]

  if (model.modalities) {
    const input = model.modalities.input?.join(", ")
    const output = model.modalities.output?.join(", ")
    if (input) lines.push(`Input modalities: ${input}`)
    if (output) lines.push(`Output modalities: ${output}`)
  }

  const features: string[] = []
  if (model.supportsTemperature) features.push("temperature")
  else lines.push("Temperature not supported")
  if (model.toolCall) features.push("tool calling")
  if (model.reasoning) features.push("reasoning")
  if (model.structuredOutput) features.push("structured output")
  if (model.attachment) features.push("attachments")
  if (features.length) lines.push(`Supported features: ${features.join(", ")}`)

  if (model.contextLimit || model.outputLimit) {
    const parts: string[] = []
    if (model.contextLimit) parts.push(`input: ${formatCount(model.contextLimit)}`)
    if (model.outputLimit) parts.push(`output: ${formatCount(model.outputLimit)}`)
    if (parts.length) lines.push(`Context window: ${parts.join(", ")}`)
  }

  if (model.pricing) {
    const parts: string[] = []
    if (model.pricing.input !== undefined) parts.push(`input: ${formatPrice(model.pricing.input)}`)
    if (model.pricing.output !== undefined) parts.push(`output: ${formatPrice(model.pricing.output)}`)
    if (model.pricing.cacheRead !== undefined) parts.push(`cache read: ${formatPrice(model.pricing.cacheRead)}`)
    if (model.pricing.cacheWrite !== undefined) parts.push(`cache write: ${formatPrice(model.pricing.cacheWrite)}`)
    if (parts.length) lines.push(`Pricing (per 1M tokens): ${parts.join(", ")}`)
  }

  if (model.knowledgeCutoff) lines.push(`Knowledge cutoff: ${model.knowledgeCutoff}`)

  return lines.join("\n")
}

import { getModelForProvider } from "@domain/models"
import { type CostSource, isUsageOperation } from "../entities/span.ts"
import { unpriceablePairReason } from "./should-report-unpriced.ts"

/**
 * Whether a generation's captured content actually reached the reader.
 *
 * - `captured` — the payload was stored and this read loaded it.
 * - `absent` — nothing was stored, so no content reader can run on this generation.
 * - `truncated` — a payload exists but a read budget skipped it. Lowers coverage; never healthy.
 */
export const GENERATION_CONTENT_STATES = ["captured", "absent", "truncated"] as const
export type GenerationContentState = (typeof GENERATION_CONTENT_STATES)[number]

/**
 * Where a generation's spend figure stands, in the terms a Cost denominator needs.
 *
 * - `providerReported` — the instrumentation sent a cost.
 * - `registryEstimated` — priced from the model catalog. The expected case.
 * - `knownFree` — a local runtime or an explicit free tier: a real zero.
 * - `unpriced` — tokens with no usable rate, including a catalog that declines to price the pair.
 * - `unknownPair` — no provider/model identity, so nothing can be priced or looked up.
 * - `legacyUnknown` — stored before `cost_source` existed; a zero cannot be read either way.
 * - `notSpendBearing` — no usage to price, so the pair contributes no spend denominator.
 */
export const GENERATION_PRICING_STATES = [
  "providerReported",
  "registryEstimated",
  "knownFree",
  "unpriced",
  "unknownPair",
  "legacyUnknown",
  "notSpendBearing",
] as const
export type GenerationPricingState = (typeof GENERATION_PRICING_STATES)[number]

export const GENERATION_MODEL_CONTEXT_STATES = ["known", "unknownPair", "unknownContextLimit"] as const
export type GenerationModelContextState = (typeof GENERATION_MODEL_CONTEXT_STATES)[number]

export const classifyGenerationContent = ({
  storedBytes,
  loaded,
}: {
  readonly storedBytes: number
  readonly loaded: boolean
}): GenerationContentState => {
  if (storedBytes <= 0) return "absent"
  return loaded ? "captured" : "truncated"
}

export const classifyGenerationPricing = ({
  operation,
  provider,
  model,
  costSource,
}: {
  readonly operation: string
  readonly provider: string
  readonly model: string
  readonly costSource: CostSource
}): GenerationPricingState => {
  if (!isUsageOperation(operation)) return "notSpendBearing"
  switch (costSource) {
    case "provider_reported":
      return "providerReported"
    case "estimated":
      return "registryEstimated"
    case "no_tokens":
      return "notSpendBearing"
    case "unknown":
      return "legacyUnknown"
    case "unpriced": {
      const reason = unpriceablePairReason({ provider, model })
      if (reason === "noPair") return "unknownPair"
      return reason === "localRuntime" || reason === "freeTier" ? "knownFree" : "unpriced"
    }
  }
}

export interface GenerationModelContext {
  readonly state: GenerationModelContextState
  readonly contextLimitTokens: number | null
}

export const classifyGenerationModelContext = ({
  provider,
  model,
}: {
  readonly provider: string
  readonly model: string
}): GenerationModelContext => {
  if (!provider || !model) return { state: "unknownPair", contextLimitTokens: null }
  const contextLimitTokens = getModelForProvider(provider, model)?.contextLimit
  return contextLimitTokens === undefined || contextLimitTokens <= 0
    ? { state: "unknownContextLimit", contextLimitTokens: null }
    : { state: "known", contextLimitTokens }
}

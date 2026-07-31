/**
 * Identity and behaviour only — deliberately no prices. Seeded spans are costed
 * from the `@domain/models` registry, the same source the ingest path prices real
 * traffic from, so a fixture can never disagree with what the dashboard derives
 * from the same pair. `@domain/shared` sits below the registry and cannot import
 * it; the lookup happens where the cost is computed, in the span builders.
 */
export type ModelConfig = {
  readonly provider: string
  readonly model: string
  readonly responseModel: string
  readonly scopeName: string
  readonly latencyRange: readonly [min: number, max: number]
  readonly isReasoning?: boolean
  readonly finishReasonStop: string
}

export const MODELS: readonly ModelConfig[] = [
  {
    provider: "openai",
    model: "gpt-4o",
    responseModel: "gpt-4o-2024-08-06",
    scopeName: "openai-instrumentation",
    latencyRange: [600, 2500],
    finishReasonStop: "stop",
  },
  {
    provider: "openai",
    model: "gpt-4o-mini",
    responseModel: "gpt-4o-mini-2024-07-18",
    scopeName: "openai-instrumentation",
    latencyRange: [200, 900],
    finishReasonStop: "stop",
  },
  {
    provider: "openai",
    model: "o3-mini",
    responseModel: "o3-mini-2025-01-31",
    scopeName: "openai-instrumentation",
    latencyRange: [1500, 6000],
    isReasoning: true,
    finishReasonStop: "stop",
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    responseModel: "claude-sonnet-4-6-20250514",
    scopeName: "anthropic-instrumentation",
    latencyRange: [800, 3500],
    finishReasonStop: "end_turn",
  },
  {
    // Every model here must be one the registry still prices. `claude-3-5-haiku`
    // sat in this slot until it aged out of models.dev, at which point costing from
    // the registry turned a seventh of ambient traffic silently unpriced.
    provider: "anthropic",
    model: "claude-sonnet-5",
    responseModel: "claude-sonnet-5",
    scopeName: "anthropic-instrumentation",
    latencyRange: [300, 1200],
    finishReasonStop: "end_turn",
  },
  {
    provider: "deepseek",
    model: "deepseek-chat",
    responseModel: "deepseek-chat",
    scopeName: "deepseek-instrumentation",
    latencyRange: [400, 1800],
    finishReasonStop: "stop",
  },
  {
    provider: "google",
    model: "gemini-2.0-flash",
    responseModel: "gemini-2.0-flash",
    scopeName: "google-genai-instrumentation",
    latencyRange: [200, 800],
    finishReasonStop: "stop",
  },
]

export const EMBEDDING_MODELS: readonly ModelConfig[] = [
  {
    provider: "openai",
    model: "text-embedding-3-small",
    responseModel: "text-embedding-3-small",
    scopeName: "openai-instrumentation",
    latencyRange: [40, 200],
    finishReasonStop: "stop",
  },
  {
    provider: "openai",
    model: "text-embedding-3-large",
    responseModel: "text-embedding-3-large",
    scopeName: "openai-instrumentation",
    latencyRange: [50, 300],
    finishReasonStop: "stop",
  },
]

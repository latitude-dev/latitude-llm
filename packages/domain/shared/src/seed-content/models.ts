export type ModelConfig = {
  readonly provider: string
  readonly model: string
  readonly responseModel: string
  readonly scopeName: string
  readonly costInPerMToken: number
  readonly costOutPerMToken: number
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
    costInPerMToken: 250,
    costOutPerMToken: 1000,
    latencyRange: [600, 2500],
    finishReasonStop: "stop",
  },
  {
    provider: "openai",
    model: "gpt-4o-mini",
    responseModel: "gpt-4o-mini-2024-07-18",
    scopeName: "openai-instrumentation",
    costInPerMToken: 15,
    costOutPerMToken: 60,
    latencyRange: [200, 900],
    finishReasonStop: "stop",
  },
  {
    provider: "openai",
    model: "o3-mini",
    responseModel: "o3-mini-2025-01-31",
    scopeName: "openai-instrumentation",
    costInPerMToken: 110,
    costOutPerMToken: 440,
    latencyRange: [1500, 6000],
    isReasoning: true,
    finishReasonStop: "stop",
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    responseModel: "claude-sonnet-4-6-20250514",
    scopeName: "anthropic-instrumentation",
    costInPerMToken: 300,
    costOutPerMToken: 1500,
    latencyRange: [800, 3500],
    finishReasonStop: "end_turn",
  },
  {
    provider: "anthropic",
    model: "claude-3-5-haiku",
    responseModel: "claude-3-5-haiku-20241022",
    scopeName: "anthropic-instrumentation",
    costInPerMToken: 80,
    costOutPerMToken: 400,
    latencyRange: [300, 1200],
    finishReasonStop: "end_turn",
  },
  {
    provider: "deepseek",
    model: "deepseek-chat",
    responseModel: "deepseek-chat",
    scopeName: "deepseek-instrumentation",
    costInPerMToken: 14,
    costOutPerMToken: 28,
    latencyRange: [400, 1800],
    finishReasonStop: "stop",
  },
  {
    provider: "google",
    model: "gemini-2.0-flash",
    responseModel: "gemini-2.0-flash",
    scopeName: "google-genai-instrumentation",
    costInPerMToken: 10,
    costOutPerMToken: 40,
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
    costInPerMToken: 2,
    costOutPerMToken: 0,
    latencyRange: [40, 200],
    finishReasonStop: "stop",
  },
  {
    provider: "openai",
    model: "text-embedding-3-large",
    responseModel: "text-embedding-3-large",
    scopeName: "openai-instrumentation",
    costInPerMToken: 13,
    costOutPerMToken: 0,
    latencyRange: [50, 300],
    finishReasonStop: "stop",
  },
]

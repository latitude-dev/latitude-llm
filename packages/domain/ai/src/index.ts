import { Data, type Effect, ServiceMap } from "effect"

export class AIError extends Data.TaggedError("AIError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class AICredentialError extends Data.TaggedError("AICredentialError")<{
  readonly provider: string
  readonly message: string
}> {}

export interface GenerateTextInput {
  readonly provider: string
  readonly model: string
  readonly system: string
  readonly prompt: string
  readonly maxTokens?: number
  readonly temperature?: number
}

export interface GenerateTextResult {
  readonly text: string
  readonly tokens: number
  readonly duration: number // nanoseconds
}

export class AI extends ServiceMap.Service<
  AI,
  {
    generateText(input: GenerateTextInput): Effect.Effect<GenerateTextResult, AIError | AICredentialError>
  }
>()("@domain/ai/AI") {}

export class AICredentials extends ServiceMap.Service<
  AICredentials,
  {
    getApiKey(provider: string): Effect.Effect<string, AICredentialError>
  }
>()("@domain/ai/AICredentials") {}

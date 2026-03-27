import { Data, type Effect, ServiceMap } from "effect"
import type { z } from "zod"

export class AIError extends Data.TaggedError("AIError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class AICredentialError extends Data.TaggedError("AICredentialError")<{
  readonly provider: string
  readonly message: string
}> {}

/**
 * Structured generation with a Zod schema. The Vercel adapter uses the AI SDK’s
 * schema-backed object output so responses are validated, not free-form text.
 */
export interface GenerateObjectInput<T> {
  readonly provider: string
  readonly model: string
  readonly system: string
  readonly prompt: string
  readonly schema: z.ZodType<T>
  readonly maxTokens?: number
  readonly temperature?: number
}

export interface GenerateObjectResult<T> {
  readonly object: T
  readonly tokens: number
  readonly duration: number // nanoseconds
}

export class AI extends ServiceMap.Service<
  AI,
  {
    generateObject<T>(
      input: GenerateObjectInput<T>,
    ): Effect.Effect<GenerateObjectResult<T>, AIError | AICredentialError>
  }
>()("@domain/ai/AI") {}

export class AICredentials extends ServiceMap.Service<
  AICredentials,
  {
    getApiKey(provider: string): Effect.Effect<string, AICredentialError>
  }
>()("@domain/ai/AICredentials") {}

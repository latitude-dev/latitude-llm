import { Data, type Effect, ServiceMap } from "effect"
import type { z } from "zod"

export {
  formatGenAIConversation,
  formatGenAIMessage,
  formatGenAIMessagesForEnrichmentPrompt,
  formatGenAIPart,
} from "./formatAi.ts"

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
 *
 * Optional fields below mirror Vercel AI SDK `CallSettings` and `providerOptions`
 * (see https://sdk.vercel.ai/docs/ai-sdk-core/settings and provider docs).
 */
export interface GenerateObjectInput<T> {
  readonly provider: string
  readonly model: string
  readonly system: string
  readonly prompt: string
  readonly schema: z.ZodType<T>
  readonly maxTokens?: number
  readonly temperature?: number
  readonly topP?: number
  readonly topK?: number
  readonly presencePenalty?: number
  readonly frequencyPenalty?: number
  readonly stopSequences?: readonly string[]
  readonly seed?: number
  /**
   * Reasoning depth for models that support it (AI SDK `reasoning` call setting;
   * e.g. `low`, `medium`, `high`, `none`, `provider-default`).
   */
  readonly reasoning?: string
  /**
   * Provider-specific options, namespaced by provider id (e.g. `{ openai: { reasoningEffort: "low" } }`).
   * Passed through to the adapter’s `generateText({ providerOptions })`.
   */
  readonly providerOptions?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
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

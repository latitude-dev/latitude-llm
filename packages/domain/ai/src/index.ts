import { type Effect, ServiceMap } from "effect"
import type { z } from "zod"
import type { AICredentialError, AIError } from "./errors.ts"

export { AICredentialError, AIError } from "./errors.ts"
export {
  formatGenAIConversation,
  formatGenAIMessage,
  formatGenAIPart,
} from "./formatAi.ts"

// ---------------------------------------------------------------------------
// Generate (structured object generation via LLM)
// ---------------------------------------------------------------------------

/**
 * Structured generation with a Zod schema. The Vercel adapter uses the AI SDK's
 * schema-backed object output so responses are validated, not free-form text.
 *
 * Optional fields below mirror Vercel AI SDK `CallSettings` and `providerOptions`
 * (see https://sdk.vercel.ai/docs/ai-sdk-core/settings and provider docs).
 */
export interface GenerateInput<T> {
  readonly provider: string
  readonly model: string
  readonly system: string
  readonly prompt: string
  readonly schema: z.ZodType<T>
  readonly reasoning?: "none" | "provider-default" | "minimal" | "low" | "medium" | "high" | "xhigh"
  readonly maxTokens?: number
  readonly temperature?: number
  readonly topP?: number
  readonly topK?: number
  readonly presencePenalty?: number
  readonly frequencyPenalty?: number
  readonly stopSequences?: readonly string[]
  readonly seed?: number
  readonly providerOptions?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
}

export interface GenerateResult<T> {
  readonly object: T
  readonly tokens: number
  readonly duration: number // nanoseconds
}

// ---------------------------------------------------------------------------
// Embed (vector embeddings)
// ---------------------------------------------------------------------------

export interface EmbedInput {
  readonly text: string
  readonly model: string
  readonly dimensions: number
}

export interface EmbedResult {
  readonly embedding: number[]
}

// ---------------------------------------------------------------------------
// Rerank (document reranking)
// ---------------------------------------------------------------------------

export interface RerankInput {
  readonly query: string
  readonly documents: readonly string[]
  readonly model: string
}

export interface RerankResult {
  readonly index: number
  readonly relevanceScore: number
}

// ---------------------------------------------------------------------------
// AI capability services
// ---------------------------------------------------------------------------

export interface AIGenerateShape {
  generate<T>(input: GenerateInput<T>): Effect.Effect<GenerateResult<T>, AIError | AICredentialError>
}

export interface AIEmbedShape {
  embed(input: EmbedInput): Effect.Effect<EmbedResult, AIError>
}

export interface AIRerankShape {
  rerank(input: RerankInput): Effect.Effect<readonly RerankResult[], AIError>
}

export type AIShape = AIGenerateShape & AIEmbedShape & AIRerankShape

export class AIGenerate extends ServiceMap.Service<AIGenerate, AIGenerateShape>()("@domain/ai/AIGenerate") {}

export class AIEmbed extends ServiceMap.Service<AIEmbed, AIEmbedShape>()("@domain/ai/AIEmbed") {}

export class AIRerank extends ServiceMap.Service<AIRerank, AIRerankShape>()("@domain/ai/AIRerank") {}

// ---------------------------------------------------------------------------
// Unified AI service
// ---------------------------------------------------------------------------

export class AI extends ServiceMap.Service<AI, AIShape>()("@domain/ai/AI") {}

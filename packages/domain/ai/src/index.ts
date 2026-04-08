import type { ContextOptions } from "@latitude-data/telemetry"
import { EffectService } from "@repo/effect-service"
import type { Effect } from "effect"
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

export type { ContextOptions } from "@latitude-data/telemetry"

/**
 * Latitude `capture` third-argument options (`ContextOptions` from `@latitude-data/telemetry`) plus the
 * required root span name (first argument to `capture`). Optional `name` here is the merged-context
 * override in `ContextOptions`, distinct from `spanName`.
 */
export type GenerateTelemetryCapture = ContextOptions & {
  readonly spanName: string
}

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
  /**
   * When set, the Vercel adapter wraps the provider call in Latitude `capture` for tracing.
   * Does not affect generation semantics; excluded from AI cache keys (see `withAICache`).
   */
  readonly telemetry?: GenerateTelemetryCapture
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
  /**
   * When set, the Voyage adapter wraps the provider call in Latitude `capture` for tracing.
   * Excluded from AI cache keys (see `withAICache`).
   */
  readonly telemetry?: GenerateTelemetryCapture
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
  /**
   * When set, the Voyage adapter wraps the provider call in Latitude `capture` for tracing.
   * Excluded from AI cache keys (see `withAICache`).
   */
  readonly telemetry?: GenerateTelemetryCapture
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

export class AIGenerate extends EffectService<AIGenerate, AIGenerateShape>()("@domain/ai/AIGenerate") {}

export class AIEmbed extends EffectService<AIEmbed, AIEmbedShape>()("@domain/ai/AIEmbed") {}

export class AIRerank extends EffectService<AIRerank, AIRerankShape>()("@domain/ai/AIRerank") {}

// ---------------------------------------------------------------------------
// Unified AI service
// ---------------------------------------------------------------------------

export class AI extends EffectService<AI, AIShape>()("@domain/ai/AI") {}

import type { ContextOptions } from "@latitude-data/telemetry"
import { Context, type Effect } from "effect"
import type { z } from "zod"
import type { GenerationReasoning } from "./config.ts"
import type { AICredentialError, AIError } from "./errors.ts"

export {
  AI_GENERATE_TELEMETRY_SPAN_NAMES,
  AI_GENERATE_TELEMETRY_TAGS,
  buildProjectScopedAiMetadata,
  type ProjectScopedAiIds,
} from "./ai-generate-telemetry.ts"
export {
  type AIProviderModelConfig,
  DEFAULT_EMBEDDING_CONFIG,
  DEFAULT_RERANKING_CONFIG,
  EMBEDDING_DIMENSIONS,
  GENERATION_FEATURES,
  GENERATION_REASONING_LEVELS,
  type GenerationFeature,
  type GenerationModelConfig,
  type GenerationReasoning,
  resolveEmbeddingConfig,
  resolveGenerationConfig,
  resolveRerankingConfig,
} from "./config.ts"
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
  readonly reasoning?: GenerationReasoning
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
  readonly tokenUsage?: {
    readonly input: number
    readonly output: number
    readonly reasoning?: number | undefined
    readonly cacheRead?: number | undefined
    readonly cacheWrite?: number | undefined
  }
}

// ---------------------------------------------------------------------------
// Embed (vector embeddings)
// ---------------------------------------------------------------------------

export interface EmbedInput {
  readonly text: string
  readonly provider: string
  readonly model: string
  /**
   * Voyage (and most asymmetric embedding models) produce different vectors
   * for documents vs queries. Indexing callers should use `"document"`;
   * search-time callers should use `"query"`. Defaults to `"document"`.
   */
  readonly inputType?: "document" | "query"
  /**
   * When set, the embedding adapter wraps the provider call in Latitude `capture` for tracing.
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
  readonly provider: string
  readonly model: string
  /**
   * When set, the rerank adapter wraps the provider call in Latitude `capture` for tracing.
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

export class AIGenerate extends Context.Service<AIGenerate, AIGenerateShape>()("@domain/ai/AIGenerate") {}

export class AIEmbed extends Context.Service<AIEmbed, AIEmbedShape>()("@domain/ai/AIEmbed") {}

export class AIRerank extends Context.Service<AIRerank, AIRerankShape>()("@domain/ai/AIRerank") {}

// ---------------------------------------------------------------------------
// Agent loop (native tool-calling)
// ---------------------------------------------------------------------------

/**
 * A tool the agent loop can call. `inputSchema` is the model-facing schema the
 * adapter hands the provider; `execute` is an opaque promise the adapter awaits
 * with the raw provider-parsed input. Callers own validation and error shaping
 * inside `execute` — the adapter never inspects the input or the return value.
 */
export interface AgentToolDef {
  readonly name: string
  readonly description: string
  readonly inputSchema: z.ZodType
  readonly execute: (input: unknown) => Promise<unknown>
}

/** One provider step: any assistant narration plus the tool calls it issued. */
export interface AgentStep {
  /** Assistant text generated this step; the worker mirrors it into the pending status. */
  readonly text?: string
  readonly toolCalls: ReadonlyArray<{ readonly name: string; readonly input: unknown }>
  readonly finishReason?: string
  readonly tokenUsage?: { readonly input: number; readonly output: number }
}

export interface AgentPrepareStepInput {
  readonly stepNumber: number
}

export interface AgentPrepareStepResult {
  readonly activeTools?: ReadonlyArray<string>
}

/**
 * Provider-neutral conversation message. Round-trips a multi-turn tool loop: the
 * adapter maps these to/from the Vercel SDK message shapes so callers can persist
 * a transcript and replay it on the next turn without importing SDK types.
 */
export type AgentMessagePart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "tool-call"; readonly toolCallId: string; readonly toolName: string; readonly input: unknown }
  | { readonly type: "tool-result"; readonly toolCallId: string; readonly toolName: string; readonly output: unknown }

export interface AgentMessage {
  readonly role: "user" | "assistant" | "tool"
  readonly content: string | ReadonlyArray<AgentMessagePart>
}

export interface RunAgentInput {
  readonly provider: string
  readonly model: string
  readonly system: string
  /** Single-turn prompt. Ignored when `messages` is provided. */
  readonly prompt: string
  /** Prior conversation to continue. When set (non-empty), the loop runs against it instead of `prompt`. */
  readonly messages?: ReadonlyArray<AgentMessage>
  readonly tools: ReadonlyArray<AgentToolDef>
  /** Hard ceiling on provider steps; the loop stops once this many steps run. */
  readonly maxSteps: number
  readonly reasoning?: GenerationReasoning
  readonly maxTokens?: number
  readonly temperature?: number
  readonly abortSignal?: AbortSignal
  readonly activeTools?: ReadonlyArray<string>
  readonly prepareStep?: (
    step: AgentPrepareStepInput,
  ) => AgentPrepareStepResult | Promise<AgentPrepareStepResult | undefined> | undefined
  /** Invoked after each provider step, in order. Never throws into the loop. */
  readonly onStep?: (step: AgentStep) => void
  readonly telemetry?: GenerateTelemetryCapture
}

export interface RunAgentResult {
  readonly text: string
  readonly steps: ReadonlyArray<AgentStep>
  /** The assistant + tool messages produced this turn, to append to the transcript and replay next turn. */
  readonly responseMessages: ReadonlyArray<AgentMessage>
  readonly tokenUsage: { readonly input: number; readonly output: number }
  readonly finishReason: string
}

export interface AIAgentShape {
  runAgent(input: RunAgentInput): Effect.Effect<RunAgentResult, AIError | AICredentialError>
}

export class AIAgent extends Context.Service<AIAgent, AIAgentShape>()("@domain/ai/AIAgent") {}

// ---------------------------------------------------------------------------
// Unified AI service
// ---------------------------------------------------------------------------

export class AI extends Context.Service<AI, AIShape>()("@domain/ai/AI") {}

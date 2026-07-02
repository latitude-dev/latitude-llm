import { Context, type Effect } from "effect"
import type { ScriptCapability } from "../capabilities.ts"
import type { ScriptRunLimits } from "../constants.ts"
import type { RunResult } from "../contract.ts"
import type { ScriptCompileError, ScriptRunError } from "../errors.ts"
import type { SchemaDescriptor } from "../schema-descriptor.ts"

export interface ScriptConversationMessage {
  readonly role: string
  readonly content: string
}

export interface ScriptCostBreakdown {
  readonly input: number
  readonly output: number
  readonly total: number
}

export interface ScriptTokenBreakdown {
  readonly input: number
  readonly output: number
  readonly total: number
  readonly cacheRead: number
  readonly cacheCreate: number
  readonly reasoning: number
}

/** A tool span (`operation = execute_tool`) projected for the script; `input`/`output` are truncated. */
export interface ScriptToolContext {
  readonly name: string
  readonly input: string
  readonly output: string
  readonly error: boolean
  readonly duration: number
}

export interface ScriptTraceContext {
  readonly id: string
  readonly name: string
  readonly status: string
  readonly errorCount: number
  readonly spanCount: number
  readonly duration: number
  readonly timeToFirstToken: number
  readonly cost: ScriptCostBreakdown
  readonly tokens: ScriptTokenBreakdown
  readonly models: readonly string[]
  readonly providers: readonly string[]
  readonly finishReasons: readonly string[]
  readonly tools: readonly ScriptToolContext[]
}

/**
 * The single runtime context bound into every evaluation script as the `session` global. Built from a
 * trace's session (`@domain/spans`). `conversation` is the lossy, deduped, session-wide transcript (its
 * `toString()` renders `[role] content` lines) used by `llm()`; per-trace rollups plus the `tools`
 * projection carry the structured metrics + tool data deterministic conditions read. There is no raw
 * per-span array. Base units: ns, microcents, token counts.
 */
export interface ScriptSessionContext {
  readonly id: string
  readonly traceCount: number
  readonly spanCount: number
  readonly errorCount: number
  readonly duration: number
  readonly timeToFirstToken: number
  readonly cost: ScriptCostBreakdown
  readonly tokens: ScriptTokenBreakdown
  readonly startTime: string
  readonly endTime: string
  readonly userId: string
  readonly tags: readonly string[]
  readonly metadata: Readonly<Record<string, string>>
  readonly conversation: readonly ScriptConversationMessage[]
  readonly traces: readonly ScriptTraceContext[]
}

export interface ScriptRunContext {
  readonly session: ScriptSessionContext
}

/** Schema-less generation is out of contract: every `llm()` call declares its output shape. */
export interface HostLlmCall {
  readonly prompt: string
  readonly schema: SchemaDescriptor
}

/** Metering units match score rows: `duration` ns, `cost` microcents. */
export interface HostLlmResult {
  readonly object: unknown
  readonly tokens: number
  readonly duration: number
  readonly cost: number
}

/**
 * Host implementation behind the script's `llm()` global. Callers inject it
 * per run (the evaluation executor backs it with `@domain/ai`); model,
 * provider, and system prompt stay host-managed.
 */
export type HostLlmFunction = (call: HostLlmCall) => Promise<HostLlmResult>

/** The sandbox passes only the query string; the host closure holds session/org/project. */
export interface HostSimilarityCall {
  readonly query: string
}

/** Metering units match score rows: `duration` ns, `cost` microcents. `similarity` is in [0,1]. */
export interface HostSimilarityResult {
  readonly similarity: number
  readonly tokens: number
  readonly duration: number
  readonly cost: number
}

/**
 * Host implementation behind the script's `semanticSimilarity()` global. Reads
 * ingest-time message embeddings for the current session and embeds the query
 * at most once per distinct string; org/project/session stay host-managed.
 */
export type HostSimilarityFunction = (call: HostSimilarityCall) => Promise<HostSimilarityResult>

export interface CompileScriptInput {
  readonly source: string
  /** Explicit capability declaration; defaults to static detection. */
  readonly capabilities?: readonly ScriptCapability[]
}

export interface CompiledScript {
  readonly source: string
  /** SHA-256 hex of the source — artifact provenance and bytecode-cache key. */
  readonly contentHash: string
  readonly capabilities: readonly ScriptCapability[]
}

export interface ScriptRunInput {
  readonly script: CompiledScript
  readonly context: ScriptRunContext
  /** Defaults derive from the script's capabilities (pure vs embedding vs llm lane). */
  readonly limits?: ScriptRunLimits
  /** Required for `llm`-capability scripts; omitted for pure runs. */
  readonly llm?: HostLlmFunction
  /** Required for `embedding`-capability scripts; omitted otherwise. */
  readonly similarity?: HostSimilarityFunction
}

export interface ScriptRuntimeShape {
  compile(input: CompileScriptInput): Effect.Effect<CompiledScript, ScriptCompileError>
  run(input: ScriptRunInput): Effect.Effect<RunResult, ScriptRunError>
}

export class ScriptRuntime extends Context.Service<ScriptRuntime, ScriptRuntimeShape>()(
  "@domain/sandbox/ScriptRuntime",
) {}

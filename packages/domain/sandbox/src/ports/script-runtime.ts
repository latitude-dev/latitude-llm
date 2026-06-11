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

/** `{ name, description }` context of the owning entity (`issue` / `signal` globals). */
export interface ScriptSubjectContext {
  readonly name: string
  readonly description: string
}

export interface ScriptRunContext {
  readonly conversation: readonly ScriptConversationMessage[]
  readonly issue?: ScriptSubjectContext
  readonly signal?: ScriptSubjectContext
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
  /** Defaults derive from the script's capabilities (pure vs llm lane). */
  readonly limits?: ScriptRunLimits
  /** Required for `llm`-capability scripts; omitted for pure runs. */
  readonly llm?: HostLlmFunction
}

export interface ScriptRuntimeShape {
  compile(input: CompileScriptInput): Effect.Effect<CompiledScript, ScriptCompileError>
  run(input: ScriptRunInput): Effect.Effect<RunResult, ScriptRunError>
}

export class ScriptRuntime extends Context.Service<ScriptRuntime, ScriptRuntimeShape>()(
  "@domain/sandbox/ScriptRuntime",
) {}

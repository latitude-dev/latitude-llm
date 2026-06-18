import { Effect, Layer } from "effect"
import { resolveScriptCapabilities } from "../capabilities.ts"
import type { RunResult } from "../contract.ts"
import type { ScriptCompileError, ScriptRunError } from "../errors.ts"
import {
  type CompiledScript,
  type CompileScriptInput,
  type ScriptRunInput,
  ScriptRuntime,
  type ScriptRuntimeShape,
} from "../ports/script-runtime.ts"

export interface FakeScriptRuntimeCalls {
  readonly compile: CompileScriptInput[]
  readonly run: ScriptRunInput[]
}

interface FakeScriptRuntimeOverrides {
  compile?(input: CompileScriptInput): Effect.Effect<CompiledScript, ScriptCompileError>
  run?(input: ScriptRunInput): Effect.Effect<RunResult, ScriptRunError>
}

export const createFakeScriptRuntime = (overrides?: FakeScriptRuntimeOverrides) => {
  const calls: FakeScriptRuntimeCalls = {
    compile: [],
    run: [],
  }

  const defaultCompile = (input: CompileScriptInput): Effect.Effect<CompiledScript, ScriptCompileError> =>
    Effect.succeed({
      source: input.source,
      contentHash: `fake-${input.source.length}`,
      capabilities: resolveScriptCapabilities({ source: input.source, declared: input.capabilities }),
    })

  const defaultRun = (_input: ScriptRunInput): Effect.Effect<RunResult, ScriptRunError> =>
    Effect.succeed({ value: 1, passed: true, duration: 0, tokens: 0, cost: 0 })

  const runtime: ScriptRuntimeShape = {
    compile: (input) => {
      calls.compile.push(input)
      return (overrides?.compile ?? defaultCompile)(input)
    },
    run: (input) => {
      calls.run.push(input)
      return (overrides?.run ?? defaultRun)(input)
    },
  }

  return {
    runtime,
    calls,
    layer: Layer.succeed(ScriptRuntime, runtime),
  }
}

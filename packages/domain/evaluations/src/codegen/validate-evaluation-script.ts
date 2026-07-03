import { hashOptimizationCandidateText } from "@domain/optimizations"
import { type ScriptCompileError, ScriptRuntime } from "@domain/sandbox"
import { BadRequestError } from "@domain/shared"
import { Effect } from "effect"

/**
 * Compile-on-save validation: compiles the script in the QuickJS sandbox and surfaces a
 * `ScriptCompileError` (HTTP 422) when it is not valid — e.g. a raw script with a syntax error,
 * or settings whose `criteria` injected an unescaped backtick into the generated template.
 */
export const validateEvaluationScriptCompiles = (
  script: string,
): Effect.Effect<void, ScriptCompileError, ScriptRuntime> =>
  Effect.gen(function* () {
    const runtime = yield* ScriptRuntime
    yield* runtime.compile({ source: script })
  })

/**
 * Validates that `script` compiles in the sandbox and returns its content hash (stamped onto each
 * score's `metadata.evaluationHash`). Shared by evaluation creation and signal-settings recompile.
 */
export const validateAndHashEvaluationScript = (
  script: string,
): Effect.Effect<string, ScriptCompileError | BadRequestError, ScriptRuntime> =>
  Effect.gen(function* () {
    yield* validateEvaluationScriptCompiles(script)
    return yield* Effect.tryPromise({
      try: () => hashOptimizationCandidateText(script),
      catch: () => new BadRequestError({ message: "Failed to hash evaluation script" }),
    })
  })

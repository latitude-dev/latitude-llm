import { type ScriptCompileError, ScriptRuntime } from "@domain/sandbox"
import type { EvaluationSettings } from "@domain/shared"
import { Effect } from "effect"
import { generateJudgePromptText } from "../alignment/baseline-prompt.ts"
import { wrapPromptAsEvaluationScript } from "../runtime/evaluation-execution.ts"

/**
 * Deterministically compiles a declarative `EvaluationSettings` into the sandbox `script` that
 * actually executes. The judge form reuses the single-sourced baseline judge wrapper, so a
 * settings-authored judge is byte-for-byte the same shape as a discovered one — capability
 * detection (`llm(`) and runtime parity hold. New kinds (deterministic rule comparators,
 * semantic similarity) extend the switch as the builder grows.
 */
export const compileSettingsToScript = (settings: EvaluationSettings): string => {
  switch (settings.kind) {
    case "judge":
      return wrapPromptAsEvaluationScript(generateJudgePromptText(settings.criteria))
  }
}

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

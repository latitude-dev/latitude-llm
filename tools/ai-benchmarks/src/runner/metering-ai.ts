import { AIGenerate } from "@domain/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import { Effect, Layer } from "effect"
import type { TokenMeter } from "./meter.ts"

/**
 * A `Layer<AIGenerate>` that wraps the real `AIGenerateLive` with a meter.
 * Every call bumps `attempts` before invoking the underlying service; on
 * success, tokens + `successes` are recorded. On error, neither tokens nor
 * success are recorded and the error is re-raised unchanged — the classifier
 * handles `AI_NoObjectGeneratedError` recovery as in production.
 *
 * The meter passed here is expected to be per-row (scoped to one
 * `classifyTraceForQueueUseCase` invocation), so the caller can read its
 * snapshot to know whether the LLM was invoked and whether the call
 * succeeded — that drives decision-phase detection.
 */
export const meteringAIGenerateLive = (meter: TokenMeter): Layer.Layer<AIGenerate, never, never> =>
  Layer.effect(
    AIGenerate,
    Effect.gen(function* () {
      const inner = yield* AIGenerate
      return {
        generate: (input) =>
          Effect.gen(function* () {
            meter.recordAttempt()
            const result = yield* inner.generate(input)
            meter.recordSuccess(result.tokenUsage)
            return result
          }),
      }
    }),
  ).pipe(Layer.provide(AIGenerateLive))

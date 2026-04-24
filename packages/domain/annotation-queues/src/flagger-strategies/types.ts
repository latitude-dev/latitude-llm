import type { TraceDetail } from "@domain/spans"

/**
 * Result of deterministic detection phase.
 * - matched: deterministic match found; `feedback` is written to the score row directly.
 * - no-match: deterministic clean; may still go to LLM via sampling.
 * - ambiguous: proceed to LLM classification (gated by per-org+strategy rate limit).
 */
export type DetectionResult =
  | { readonly kind: "matched"; readonly feedback: string }
  | { readonly kind: "no-match" }
  | { readonly kind: "ambiguous" }

/**
 * Per-queue strategy contract for the system queue flagger.
 * Each queue slug can implement a mix of deterministic and LLM-based detection.
 *
 * Strategies with LLM prompts (`buildSystemPrompt` + `buildPrompt`) back a provisioned
 * system queue; strategies without them are deterministic-only and never run LLM.
 */
export interface QueueStrategy {
  /** Check if the trace has the required context for this queue's detection */
  hasRequiredContext(trace: TraceDetail): boolean

  /**
   * Deterministic detection phase. Always runs on every trace-end.
   * When absent, the strategy behaves as if it returned `no-match` for every trace.
   */
  detectDeterministically?(trace: TraceDetail): DetectionResult

  /** Build the system prompt for LLM classification. Required for LLM-capable strategies. */
  buildSystemPrompt?(trace: TraceDetail): string

  /** Build the user prompt for LLM classification. Required for LLM-capable strategies. */
  buildPrompt?(trace: TraceDetail): string
}

import type { TraceDetail } from "@domain/spans"

/**
 * Result of deterministic detection phase.
 * - matched: true - deterministic match found, queue it
 * - matched: false - deterministic clean, skip LLM
 * - ambiguous - not sure, proceed to LLM fallback
 */
export type DetectionResult =
  | { readonly kind: "matched" }
  | { readonly kind: "no-match" }
  | { readonly kind: "ambiguous" }

/**
 * Per-queue strategy contract for the system queue flagger.
 * Each queue slug can implement a mix of deterministic and LLM-based detection.
 */
export interface QueueStrategy {
  /** Check if the trace has the required context for this queue's detection */
  hasRequiredContext(trace: TraceDetail): boolean

  /**
   * Deterministic detection phase.
   * Returns matched/no-match/ambiguous to decide routing.
   * If not implemented, defaults to ambiguous (proceed to LLM).
   */
  detectDeterministically?(trace: TraceDetail): DetectionResult

  /** Build the system prompt for LLM fallback (only called if needed) */
  buildSystemPrompt(trace: TraceDetail): string

  /** Build the user prompt for LLM fallback (only called if needed) */
  buildPrompt(trace: TraceDetail): string
}

import type { TraceDetail } from "@domain/spans"
import { detectEmptyResponseFlagger } from "../helpers.ts"
import type { DetectionResult, FlaggerStrategy } from "./types.ts"

/**
 * Deterministic-only strategy. Flags empty, whitespace-only, or degenerate
 * assistant responses while skipping tool-call-only delegations. Never calls
 * an LLM.
 */
export const emptyResponseStrategy: FlaggerStrategy = {
  details: {
    name: "Empty response",
    description: "Flags empty, whitespace-only, or degenerate assistant responses without calling an LLM.",
  },

  hasRequiredContext(trace: TraceDetail): boolean {
    return trace.outputMessages.length > 0
  },

  detectDeterministically(trace: TraceDetail): DetectionResult {
    const result = detectEmptyResponseFlagger(trace)
    return result.matched ? { kind: "matched", feedback: result.feedback } : { kind: "no-match" }
  },
}

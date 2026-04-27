import type { TraceDetail } from "@domain/spans"
import { detectEmptyResponseFlagger } from "../helpers.ts"
import type { DetectionResult, QueueStrategy } from "./types.ts"

/**
 * Deterministic-only strategy. Flags empty, whitespace-only, or degenerate
 * assistant responses while skipping tool-call-only delegations. Never calls
 * an LLM.
 */
export const emptyResponseStrategy: QueueStrategy = {
  hasRequiredContext(trace: TraceDetail): boolean {
    return trace.outputMessages.length > 0
  },

  detectDeterministically(trace: TraceDetail): DetectionResult {
    const result = detectEmptyResponseFlagger(trace)
    return result.matched ? { kind: "matched", feedback: result.feedback } : { kind: "no-match" }
  },
}

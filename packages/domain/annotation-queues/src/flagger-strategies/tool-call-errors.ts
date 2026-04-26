import type { TraceDetail } from "@domain/spans"
import { detectToolCallErrorsSystemQueue } from "../helpers.ts"
import type { DetectionResult, QueueStrategy } from "./types.ts"

/**
 * Deterministic-only strategy. Inspects tool-call / tool-response pairs in the
 * trace's messages and flags traces that emit malformed, duplicate, or
 * explicitly-failed tool responses. Never calls an LLM.
 */
export const toolCallErrorsStrategy: QueueStrategy = {
  hasRequiredContext(trace: TraceDetail): boolean {
    return trace.allMessages.length > 0
  },

  detectDeterministically(trace: TraceDetail): DetectionResult {
    const result = detectToolCallErrorsSystemQueue(trace)
    return result.matched ? { kind: "matched", feedback: result.feedback } : { kind: "no-match" }
  },
}

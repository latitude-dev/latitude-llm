import type { TraceDetail } from "@domain/spans"
import { detectToolCallErrorsFlagger } from "../helpers.ts"
import type { DetectionResult, FlaggerStrategy } from "./types.ts"

/**
 * Deterministic-only strategy. Inspects tool-call / tool-response pairs in the
 * trace's messages and flags traces that emit malformed, duplicate, or
 * explicitly-failed tool responses. Never calls an LLM.
 */
export const toolCallErrorsStrategy: FlaggerStrategy = {
  details: {
    name: "Tool call errors",
    description: "Flags malformed, duplicate, or explicitly failed tool responses without calling an LLM.",
  },

  hasRequiredContext(trace: TraceDetail): boolean {
    return trace.allMessages.length > 0
  },

  detectDeterministically(trace: TraceDetail): DetectionResult {
    const result = detectToolCallErrorsFlagger(trace)
    return result.matched
      ? { kind: "matched", feedback: result.feedback, messageIndex: result.messageIndex }
      : { kind: "no-match" }
  },
}

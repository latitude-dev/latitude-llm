import type { TraceDetail } from "@domain/spans"
import { detectOutputSchemaValidationSystemQueue } from "../helpers.ts"
import type { DetectionResult, QueueStrategy } from "./types.ts"

/**
 * Deterministic-only strategy. Detects malformed or truncated structured
 * output (unclosed JSON strings, trailing commas, parse failures) in assistant
 * text parts. Never calls an LLM.
 */
export const outputSchemaValidationStrategy: QueueStrategy = {
  hasRequiredContext(trace: TraceDetail): boolean {
    return trace.outputMessages.length > 0
  },

  detectDeterministically(trace: TraceDetail): DetectionResult {
    const result = detectOutputSchemaValidationSystemQueue(trace)
    return result.matched ? { kind: "matched", feedback: result.feedback } : { kind: "no-match" }
  },
}

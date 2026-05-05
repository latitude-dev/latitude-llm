import type { TraceDetail } from "@domain/spans"
import { detectOutputSchemaValidationFlagger } from "../helpers.ts"
import type { DetectionResult, FlaggerStrategy } from "./types.ts"

/**
 * Deterministic-only strategy. Detects malformed or truncated structured
 * output (unclosed JSON strings, trailing commas, parse failures) in assistant
 * text parts. Never calls an LLM.
 */
export const outputSchemaValidationStrategy: FlaggerStrategy = {
  details: {
    name: "Output schema validation",
    description: "Flags malformed or truncated structured output in assistant responses without calling an LLM.",
  },

  hasRequiredContext(trace: TraceDetail): boolean {
    return trace.outputMessages.length > 0
  },

  detectDeterministically(trace: TraceDetail): DetectionResult {
    const result = detectOutputSchemaValidationFlagger(trace)
    return result.matched
      ? { kind: "matched", feedback: result.feedback, messageIndex: result.messageIndex }
      : { kind: "no-match" }
  },
}

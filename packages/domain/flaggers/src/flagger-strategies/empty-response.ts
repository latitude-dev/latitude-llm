import type { FlaggerConversation } from "../conversation.ts"
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

  hasRequiredContext(conversation: FlaggerConversation): boolean {
    return conversation.outputMessages.length > 0
  },

  detectDeterministically(conversation: FlaggerConversation): DetectionResult {
    const result = detectEmptyResponseFlagger(conversation)
    return result.matched
      ? { kind: "matched", feedback: result.feedback, messageIndex: result.messageIndex }
      : { kind: "unmatched" }
  },
}

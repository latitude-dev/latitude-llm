import type { FlaggerConversation } from "../conversation.ts"
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

  hasRequiredContext(conversation: FlaggerConversation): boolean {
    return conversation.allMessages.length > 0
  },

  detectDeterministically(conversation: FlaggerConversation): DetectionResult {
    const result = detectToolCallErrorsFlagger(conversation)
    return result.matched
      ? { kind: "matched", feedback: result.feedback, messageIndex: result.messageIndex }
      : { kind: "unmatched" }
  },
}

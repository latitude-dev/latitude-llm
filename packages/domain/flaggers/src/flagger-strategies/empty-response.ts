import type { FlaggerConversation } from "../conversation.ts"
import { buildMessageFlaggerFindingRead, detectEmptyResponseFlagger } from "../helpers.ts"
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

  readDeterministically({ scope, conversation }) {
    const result = detectEmptyResponseFlagger(conversation)
    if (!result.matched) return buildMessageFlaggerFindingRead({ scope, conversation, findings: [] })
    if (result.messageIndex === undefined) throw new Error("Empty-response finding has no anchor")
    return buildMessageFlaggerFindingRead({
      scope,
      conversation,
      findings: [
        {
          finding: {
            flaggerSlug: "empty-response",
            findingKind: result.findingKind,
            feedback: result.feedback,
            messageIndex: result.messageIndex,
          },
        },
      ],
    })
  },
}

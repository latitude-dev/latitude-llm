import type { FlaggerConversation } from "../conversation.ts"
import { buildMessageFlaggerFindingRead, detectOutputSchemaValidationFlagger } from "../helpers.ts"
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

  hasRequiredContext(conversation: FlaggerConversation): boolean {
    return conversation.outputMessages.length > 0
  },

  detectDeterministically(conversation: FlaggerConversation): DetectionResult {
    const result = detectOutputSchemaValidationFlagger(conversation)
    return result.matched
      ? { kind: "matched", feedback: result.feedback, messageIndex: result.messageIndex }
      : { kind: "unmatched" }
  },

  readDeterministically({ scope, conversation }) {
    const result = detectOutputSchemaValidationFlagger(conversation)
    if (!result.matched) return buildMessageFlaggerFindingRead({ scope, conversation, findings: [] })
    if (result.messageIndex === undefined) throw new Error("Output-schema finding has no anchor")
    return buildMessageFlaggerFindingRead({
      scope,
      conversation,
      findings: [
        {
          finding: {
            flaggerSlug: "output-schema-validation",
            findingKind: result.findingKind,
            feedback: result.feedback,
            messageIndex: result.messageIndex,
          },
        },
      ],
    })
  },
}

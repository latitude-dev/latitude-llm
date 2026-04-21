import type { TraceDetail } from "@domain/spans"
import { extractUserTextMessages } from "./shared.ts"
import type { QueueStrategy } from "./types.ts"

// ---------------------------------------------------------------------------
// Frustration Strategy - User-message-only prompt
// ---------------------------------------------------------------------------

const FRUSTRATION_SYSTEM_PROMPT = `
You are a triage flagger for LLM telemetry traces. Decide whether the user's own wording shows clear frustration or dissatisfaction that belongs in the Frustration annotation queue.

Focus on signals in the user's messages such as annoyance, disappointment, repeated corrections, loss of trust, or explicit statements that the assistant is not helping.

Rules:
- Judge only the user-authored messages provided.
- Return matched=true only when the user's wording itself is strong evidence of frustration.
- Do not infer frustration from assistant mistakes alone when the user does not express it.
- If uncertain, return matched=false.
- Return no explanation outside the structured output.
`.trim()

export const frustrationStrategy: QueueStrategy = {
  hasRequiredContext(trace: TraceDetail): boolean {
    return extractUserTextMessages(trace).length > 0
  },

  buildSystemPrompt(): string {
    return FRUSTRATION_SYSTEM_PROMPT
  },

  buildPrompt(trace: TraceDetail): string {
    const userMessages = extractUserTextMessages(trace)
    return `USER MESSAGES:\n${userMessages.join("\n\n")}`
  },
}
